# estimate.R
setwd("C:/Users/mulrlude/Documents/App lesekids/lesekids_projekt/lesekids")
#setwd("/home/appuser/lesekids")

library(DBI)
library(RSQLite)  # oder RPostgres, je nach DB
library(TAM)
library(tidyr)
library(dplyr)

# 1. DB-Verbindung
con <- dbConnect(SQLite(), "data/test.db")  # Pfad zur DB

# 2. Daten laden
dataIr <- dbGetQuery(con, "SELECT subject_id, item, DATE(timestamp) AS date, score FROM clean_responses")
dataRt <- dbGetQuery(con, "SELECT subject_id, item, DATE(timestamp) AS date, rt FROM clean_resp_times")

itemStack <- dbGetQuery(con, "SELECT item FROM item_contents")

# 3. Breite Datenstruktur erzeugen

#library(lme4)
#lmModel <- lmer(log(rt) ~ -1 + item + (1|subject_id:date), 
#                  data = dataRt %>% 
#                    mutate(item = factor(item),
#                           rt = log(rt) )
#                )
#summary(lmModel)

wide_data <- dataIr %>% 
  group_by(item) %>% 
  mutate(n_item = n() ) %>% 
  group_by(subject_id, date) %>%
  mutate(n_sub = n() ) %>% 
  group_by(subject_id, item) %>% 
  mutate(n_sub_item = n() ) %>%
  ungroup() %>% 
  filter(n_item > 20 & n_sub > 5 & n_sub_item <= 1) %>%
  mutate(score = ifelse(score == 1, 0, ifelse(score == 2, 1, score)) ) %>% 
  select(-n_item, -n_sub, -n_sub_item ) %>%
  tidyr::pivot_wider(names_from = item, values_from = score, values_fill = NA) %>%
  dplyr::select(-subject_id, -date)

# 4. Modell schätzen
Model <- TAM::tam.mml(as.matrix(wide_data), verbose= F)

# 5. item flags 
ModelFit  <- IRT.itemfit(Model)


itemFit <- ModelFit$RMSD %>% 
  mutate(RMSD = Group1) %>% 
  select(item, RMSD)


summary(Model$xsi$se.xsi)
itemPar<- data.frame(item = row.names(Model$xsi), 
                     xsi = Model$xsi$xsi + purrr::map_dbl(Model$xsi$se.xsi, 
                                                          function(x) rnorm(1, mean = 0 , sd = x)  )
                     )

# 6. Itemparameter extrahieren
params <- Model$item %>%
  merge(.,itemPar, by = "item") %>%
  merge(.,itemFit, by = "item") %>%
  merge(.,itemStack, by = "item", all = T) %>%
  mutate(item = as.integer(item),
         N = as.integer(ifelse(is.na(N), 0, N)),
         threshold_2 = ifelse(is.na(xsi), 0, 
                              ifelse(xsi < -5,-5, 
                              ifelse(xsi > 2,2,
                                     xsi
                                     ))),
         threshold_1 = threshold_2-2 + rnorm(length(threshold_2),mean = 0, 0.5 ),
         weight = ifelse(is.na(N) | is.na(RMSD),1,
                         ifelse(N > 150 & RMSD > 0.08,0,1 )),
         points_first_try = as.integer(round((threshold_2 + 7)*10)),
         points_later_try = as.integer(round((threshold_1 + 7)*10)),
         first_threshold = as.integer(2000), 
         estDate = format(as.POSIXct(Sys.time(), tz = "UTC"),
                         "%Y-%m-%dT%H:%M:%OS3Z")
         ) %>% 
  select(item, N, M, threshold_1, threshold_2, RMSD, 
         weight, estDate, 
         points_first_try, points_later_try, 
         first_threshold )

# 6. Tabelle löschen und neu schreiben
dbExecute(con, "DROP TABLE IF EXISTS item_parameters")
dbWriteTable(con, "item_parameters", params)

# 7. Verbindung schließen
dbDisconnect(con)
