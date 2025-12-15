# ==========================================================
# estimate_clean.R
# Schätzt Item-Parameter (IRT/TAM), berechnet Item-Fit-Flags,
# lernt Lasso-Prädiktionsmodelle für Item-Schwierigkeit und
# Bearbeitungszeit-Intensität und kombiniert diese via
# Empirical Bayes (EB). Schreibt Ergebnis-Tabellen in SQLite.
# ==========================================================

# ----------------------------
# 0) Setup & Pakete
# ----------------------------

# setwd("C:/Users/mulrlude/Documents/App lesekids/lesekids_projekt/lesekids/scripts")
# setwd("/home/appuser/lesekids/scripts")

rm(list = ls())

suppressPackageStartupMessages({
  library(DBI)
  library(RSQLite)     # ggf. RPostgres etc.
  library(TAM)
  library(tidyr)
  library(dplyr)
  library(lme4)
  library(glmnet)
  library(fastDummies)
  library(ggplot2)
  library(purrr)
})

# ----------------------------
# 1) Konfiguration
# ----------------------------

DB_PATH <- "../data/test.db"
ITEM_COV_PATH <- "./item_merkmale.Rdata"

MIN_N_PER_ITEM <- 30
MIN_N_PER_SUBDAY <- 5
MAX_N_PER_SUBITEM <- 1

# CV-Einstellungen für Prognosevarianz (sigma_pred)
CV_K <- 10
CV_R <- 20
CV_SEED <- 123

# Grenzen für Thresholds
XSI_MIN <- -5
XSI_MAX <-  2

# ----------------------------
# 2) Helper-Funktionen
# ----------------------------

# Ersetzt NA durch 99 (für Faktoren/Dummies später)
naIS99 <- function(x) ifelse(is.na(x), 99, x)

# Standard-Filterlogik (Item/Subday/Subitem) – für IR und RT wiederverwendbar
apply_common_filters <- function(df, item_col = "item", day_col = "day",
                                 subject_col = "subject_id") {
  df %>%
    group_by(.data[[item_col]]) %>%
    mutate(n_item = n()) %>%
    group_by(.data[[subject_col]], .data[[day_col]]) %>%
    mutate(n_sub = n()) %>%
    group_by(.data[[subject_col]], .data[[item_col]]) %>%
    mutate(n_sub_item = n()) %>%
    ungroup() %>%
    filter(
      n_item > MIN_N_PER_ITEM,
      n_sub  > MIN_N_PER_SUBDAY,
      n_sub_item <= MAX_N_PER_SUBITEM
    ) %>%
    select(-n_item, -n_sub, -n_sub_item)
}

# Repeated CV zur Schätzung der Prognose-Stdabw. (sigma_pred)
estimate_sigma_pred <- function(X, y, K = 10, R = 20, seed = 123) {
  set.seed(seed)
  n <- length(y)
  mse_1se <- numeric(R)
  
  for (r in seq_len(R)) {
    foldid <- sample(rep(seq_len(K), length.out = n))
    cv_fit <- cv.glmnet(X, y, alpha = 1, foldid = foldid)
    
    idx_1se <- which(cv_fit$lambda == cv_fit$lambda.1se)[1]
    mse_1se[r] <- cv_fit$cvm[idx_1se]
  }
  
  sqrt(mean(mse_1se))
}

# Trainiert finales Lasso mit lambda.1se und gibt Prädiktionen zurück
fit_lasso_predict_all <- function(X_train, y_train, X_all) {
  cv_model <- cv.glmnet(X_train, y_train, alpha = 1)
  best_lambda <- cv_model$lambda.1se
  
  final_model <- glmnet(X_train, y_train, alpha = 1, lambda = best_lambda)
  as.numeric(predict(final_model, newx = X_all)[, 1])
}

# R² aus y und y_hat
calc_rsq <- function(y, y_hat) {
  sst <- sum((y - mean(y))^2)
  sse <- sum((y_hat - y)^2)
  1 - sse / sst
}

# EB-Kombination: Schätzung (mean=x, se=se_x) + Prediction (mean=x_pred, sd=sigma_pred)
# Falls x fehlt -> nur Prediction.
empirical_bayes <- function(x, se_x, x_pred, sigma_pred) {
  w_irt  <- 1 / (se_x^2)
  w_pred <- 1 / (sigma_pred^2)
  
  x_eb <- (w_irt * x + w_pred * x_pred) / (w_irt + w_pred)
  var_eb <- 1 / (w_irt + w_pred)
  
  x_eb <- ifelse(is.na(x), x_pred, x_eb)
  se_eb <- ifelse(is.na(x), sigma_pred, sqrt(var_eb))
  
  list(mean = x_eb, se = se_eb)
}

utc_timestamp <- function() {
  format(as.POSIXct(Sys.time(), tz = "UTC"), "%Y-%m-%dT%H:%M:%OS3Z")
}

# ----------------------------
# 3) Daten laden (DB)
# ----------------------------

con <- dbConnect(SQLite(), DB_PATH)

dataIr <- dbGetQuery(con, "
  SELECT subject_id, item, day, score
  FROM clean_responses
")

dataDemo <- dbGetQuery(con, "
  SELECT subject_id, gen, lng, msr, bok
  FROM demographics
")

dataRt <- dbGetQuery(con, "
  SELECT subject_id, item, DATE(timestamp) AS day, rt, correct
  FROM clean_resp_first
  WHERE question_type = 'mc'
")

itemStack <- dbGetQuery(con, "
  SELECT item, type AS question_type
  FROM item_contents
")

dbDisconnect(con)

# ----------------------------
# 4) IRT-Daten aufbereiten (Wide) + Personen-Kovariaten (Dummy-Matrix)
# ----------------------------

# 4.1 IR: Filter + ggf. Score-Rekodierung + Wide-Format
wdataIr <- dataIr %>%
  apply_common_filters() %>%
  mutate(
    # Score-Rekodierung: 1->0, 2->1, sonst unverändert
    score = ifelse(score == 1, 0, ifelse(score == 2, 1, score))
  ) %>%
  pivot_wider(
    names_from  = item,
    values_from = score,
    values_fill = NA
  )

# 4.2 Personen-Kovariaten (Demo) passend zu wdataIr
#     -> NA zu 99, alles Faktor, dann Dummies (erste Kategorie drop)
Y <- merge(dataDemo, wdataIr, by = "subject_id", all.y = TRUE) %>%
  select(gen:bok) %>%
  mutate_all(naIS99) %>%
  mutate_all(factor) %>%
  fastDummies::dummy_cols(
    remove_selected_columns = TRUE,
    remove_first_dummy = TRUE
  )

# ----------------------------
# 5) IRT-Modell (TAM) + Item-Fit + Item-Parameter (xsi)
# ----------------------------

# Antwortmatrix (ohne subject_id, day)
resp_mat <- as.matrix(wdataIr %>% select(-subject_id, -day))

modelIr <- TAM::tam.mml(resp_mat, Y = Y, verbose = FALSE)

# Item-Fit
modelIrFit <- tam.fit(modelIr)

itemFit <- modelIrFit$itemfit %>%
  mutate(
    item = as.integer(parameter),
    Misfit = ifelse(Outfit > 1.5 | Outfit < 0.5 | Infit > 1.3 | Infit < 0.7, 1, 0)
  ) %>%
  select(item, Outfit, Infit, Misfit)

# xsi und Standardfehler
itemParResp <- data.frame(
  item   = as.integer(row.names(modelIr$xsi)),
  xsi    = modelIr$xsi$xsi,
  se.xsi = modelIr$xsi$se.xsi
)

# ----------------------------
# 6) Lasso für Item-Schwierigkeit (xsi) + EB-Kombination
# ----------------------------

# Item-Merkmale (icov) laden
load(ITEM_COV_PATH)  # erwartet Objekt 'icov'

# Merge: IRT-Parameter + Fit + Kovariaten
wrk <- itemParResp %>%
  merge(itemFit, by = "item") %>%
  filter(Misfit == 0) %>%
  select(item, xsi, se.xsi) %>%
  merge(icov, by = "item", all.y = TRUE)

# Designmatrix für alle Items
X_all <- wrk %>% select(-item, -xsi, -se.xsi) %>% as.matrix()

# Trainingsdaten: nur Items mit vorhandener xsi
X_exist <- X_all[!is.na(wrk$xsi), , drop = FALSE]
y_exist <- wrk$xsi[!is.na(wrk$xsi)]

# 6.1 Prognose-Varianz via repeated CV
sigma_pred <- estimate_sigma_pred(X_exist, y_exist, K = CV_K, R = CV_R, seed = CV_SEED)

# 6.2 Finales Lasso + Prädiktion für alle Items
xsi_pred_all <- fit_lasso_predict_all(X_exist, y_exist, X_all)

# 6.3 EB-Kombination (xsi, se) + (xsi_pred, sigma_pred)
eb_xsi <- empirical_bayes(
  x      = wrk$xsi,
  se_x   = wrk$se.xsi,
  x_pred = xsi_pred_all,
  sigma_pred = sigma_pred
)

itemParResp2 <- wrk %>%
  mutate(
    xsi_pred   = xsi_pred_all,
    sigma_pred = sigma_pred,
    xsi2       = eb_xsi$mean,
    sexsi2     = eb_xsi$se
  ) %>%
  select(item, xsi, se.xsi, xsi_pred, sigma_pred, xsi2, sexsi2)

# optional: R² der Prediction (nur dort, wo xsi vorhanden)
rsq <- calc_rsq(
  y = itemParResp2[!is.na(itemParResp2$xsi), ]$xsi,
  y_hat = itemParResp2[!is.na(itemParResp2$xsi), ]$xsi_pred
)

# optional: Visualisierung
itemParResp2 %>%
  ggplot(aes(x = xsi, y = xsi_pred, label = item)) +
  geom_text() +
  scale_x_continuous(limits = c(-3.5, 1.5)) +
  scale_y_continuous(limits = c(-3.5, 1.5)) +
  geom_abline()

# ----------------------------
# 7) Bearbeitungszeit-Modell (lmer) + Lasso + EB
# ----------------------------

# 7.1 RT-Daten filtern und transformieren
wdataRt <- dataRt %>%
  apply_common_filters() %>%
  mutate(
    rt2 = log(rt / 1000),            # ms -> s -> log
    rt2 = ifelse(rt2 > 6, 6, rt2),   # cap extreme logs
    item = factor(item)
  )

# 7.2 Mixed Model: item-spezifische Fixed Effects, Random Intercept pro (day:subject)
modelRt <- lmer(rt2 ~ -1 + item + (1 | day:subject_id), data = wdataRt)
paramTime <- coefficients(summary(modelRt))

itemParTime <- data.frame(
  item = as.integer(substring(row.names(paramTime), 5, 8)),
  timeIntensity   = paramTime[, 1],
  seTimeIntensity = paramTime[, 2]
) %>%
  merge(icov, by = "item", all.y = TRUE)

# 7.3 Lasso für timeIntensity
Xt_all <- itemParTime %>% select(-item, -timeIntensity, -seTimeIntensity) %>% as.matrix()
Xt_exist <- Xt_all[!is.na(itemParTime$timeIntensity), , drop = FALSE]
yt_exist <- itemParTime$timeIntensity[!is.na(itemParTime$timeIntensity)]

sigma_pred_t <- estimate_sigma_pred(Xt_exist, yt_exist, K = CV_K, R = CV_R, seed = CV_SEED)

time_pred_all <- fit_lasso_predict_all(Xt_exist, yt_exist, Xt_all)

rsq_t <- calc_rsq(
  y = itemParTime[!is.na(itemParTime$timeIntensity), ]$timeIntensity,
  y_hat = time_pred_all[!is.na(itemParTime$timeIntensity)]
)

# 7.4 EB-Kombination
eb_t <- empirical_bayes(
  x = itemParTime$timeIntensity,
  se_x = itemParTime$seTimeIntensity,
  x_pred = time_pred_all,
  sigma_pred = sigma_pred_t
)

itemParTime2 <- itemParTime %>%
  mutate(
    timeIntensity_pred = time_pred_all,
    sigma_pred_t = sigma_pred_t,
    timeIntensity2 = eb_t$mean,
    seTimeIntensity2 = eb_t$se
  ) %>%
  select(
    item,
    timeIntensity, seTimeIntensity,
    timeIntensity_pred, sigma_pred_t,
    timeIntensity2, seTimeIntensity2
  )

# ----------------------------
# 8) Modellparameter-Übersicht
# ----------------------------

modelParams <- data.frame(
  IrVar   = modelIr$variance,
  IrRel   = modelIr$EAP.rel,
  
  RtTau2 = data.frame(VarCorr(modelRt)) %>%
    filter(grp == "day:subject_id") %>%
    pull(vcov),
  
  RtSigma2 = sigma(modelRt)^2,
  
  R2_pred   = rsq,
  R2_pred_t = rsq_t,
  
  estDate = utc_timestamp()
)

# ----------------------------
# 9) Finale Itemparameter-Tabelle bauen
# ----------------------------

# TAM liefert Item-Tabelle u.a. mit N, M etc.
params <- modelIr$item %>%
  mutate(item = as.integer(item)) %>%
  merge(itemParResp2, by = "item", all.y = TRUE) %>%
  merge(itemFit,      by = "item", all.x = TRUE) %>%
  merge(itemParTime2, by = "item", all.x = TRUE) %>%
  merge(itemStack,    by = "item", all = TRUE) %>%
  mutate(
    item = as.integer(item),
    N = as.integer(ifelse(is.na(N), 0, N)),
    
    # Schwierigkeit begrenzen (Basis: EB-Schätzer)
    threshold_2 = pmin(pmax(xsi2, XSI_MIN), XSI_MAX),
    
    # plausible value around threshold_2 (Streuung sexsi2)
    xsipv = threshold_2 + purrr::map_dbl(sexsi2, ~ rnorm(1, mean = 0, sd = .x)),
    threshold_2pv = pmin(pmax(xsipv, XSI_MIN), XSI_MAX),
    
    # threshold_1 als "leichter" als threshold_2 (heuristisch)
    threshold_1 = threshold_2 - 2 + rnorm(length(threshold_2), mean = 0, sd = 0.5),
    
    # Gewicht: wenn viele Daten + Misfit -> 0, sonst 1
    weight = ifelse(is.na(N) | is.na(Misfit), 1,
                    ifelse(N > 150 & Misfit == 1, 0, 1)),
    
    # Punkte-Logik (heuristisch via ntile)
    points_first_try = as.integer(20 + ntile(threshold_2, n = 80)),
    points_later_try = as.integer(round(points_first_try / 2)),
    
    # Zeitintensität: falls NA -> Mittelwert
    timeIntensity = ifelse(is.na(timeIntensity2),
                           mean(itemParTime2$timeIntensity2, na.rm = TRUE),
                           timeIntensity2),
    
    # se fallback: falls NA -> Residualvarianz (wie in deinem Original)
    seTimeIntensity = ifelse(is.na(seTimeIntensity2),
                             sigma(modelRt)^2,
                             seTimeIntensity2),
    
    first_threshold = as.integer(2000),
    estDate = utc_timestamp()
  ) %>%
  select(
    item, N, M,
    threshold_1, threshold_2pv, threshold_2,
    sexsi2,
    timeIntensity, seTimeIntensity,
    Infit, Outfit, Misfit,
    weight, estDate,
    points_first_try, points_later_try,
    first_threshold
  )

# ----------------------------
# 10) In DB schreiben
# ----------------------------

con <- dbConnect(SQLite(), DB_PATH)

# Modellparameter anhängen (Historie)
#dbExecute(con, "DROP TABLE IF EXISTS model_parameters")
dbWriteTable(con, "model_parameters", modelParams, append = TRUE)

# Itemparameter: neu schreiben
dbExecute(con, "DROP TABLE IF EXISTS item_parameters")
dbWriteTable(con, "item_parameters", params)

dbDisconnect(con)

# ============================
# Ende
# ============================
