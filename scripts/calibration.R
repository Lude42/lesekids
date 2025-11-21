# estimate.R
#setwd("C:/Users/mulrlude/Documents/App lesekids/lesekids_projekt/lesekids/scripts")
setwd("/home/appuser/lesekids/scripts")
rm(list = ls())
library(DBI)
library(RSQLite)  # oder RPostgres, je nach DB
library(TAM)
library(tidyr)
library(dplyr)
library(lme4)
# 1. DB-Verbindung
con <- dbConnect(SQLite(), "../data/test.db")  # Pfad zur DB

# 2. Daten laden
dataIr <- dbGetQuery(con, "SELECT subject_id, item, day, score 
                     FROM clean_responses") 
dataRt <- dbGetQuery(con, "SELECT subject_id, item, DATE(timestamp) AS day, rt, correct
FROM clean_resp_first WHERE question_type = 'mc'" ) 
itemStack <- dbGetQuery(con, "SELECT item, type AS question_type FROM item_contents")

dbDisconnect(con)

# IR Data
wdataIr <- dataIr %>% 
  group_by(item) %>% 
  mutate(n_item = n() ) %>% 
  group_by(subject_id, day) %>%
  mutate(n_sub = n() ) %>% 
  group_by(subject_id, item) %>% 
  mutate(n_sub_item = n() ) %>%
  ungroup() %>% 
  filter(n_item > 30 & n_sub > 5 & n_sub_item <= 1) %>%
  mutate(score = ifelse(score == 1, 0, ifelse(score == 2, 1, score)) ) %>% 
  select(-n_item, -n_sub, -n_sub_item ) %>%
  tidyr::pivot_wider(names_from = item, 
                     values_from = score, values_fill = NA) %>%
  dplyr::select(-subject_id, -day)

# 4. Modell schätzen
modelIr <- TAM::tam.mml(as.matrix(wdataIr), verbose = F)

wle2a <- TAM::tam.mml.wle(modelIr )
summary(data.frame(wle2a))
#input <- list(resp=modelIr$resp, AXsi=modelIr$AXsi, B= modelIr$B )
#wle2b <- TAM::tam.mml.wle(input )
#summary(data.frame(wle2b))

# 5. item flags 
modelIrFit  <- IRT.itemfit(modelIr)

itemFit <- modelIrFit$RMSD %>% 
  mutate(RMSD = Group1, item = as.integer(item)) %>% 
  select(item, RMSD)

itemParResp<- data.frame(item = as.integer(row.names(modelIr$xsi)),
                     xsi2 = modelIr$xsi$xsi,
                     sexsi2 = modelIr$xsi$se.xsi)


# Bearbeitungszeit

wdataRt <- dataRt %>% group_by(item) %>% 
  mutate(n_item = n() ) %>% 
  group_by(subject_id, day) %>%
  mutate(n_sub = n() ) %>% 
  group_by(subject_id, item) %>% 
  mutate(n_sub_item = n() ) %>%
  ungroup() %>% 
  filter(n_item > 30 & n_sub > 5 & n_sub_item <= 1) %>% 
  mutate(rt2 = log(rt/1000), 
         rt2 = ifelse(rt2 > 6, 6, rt2),
         item =factor(item) )


modelRt <- lmer(rt2 ~ -1 + item +(1 |day:subject_id), 
                data = wdataRt )

paramTime <- coefficients(summary(modelRt))

itemParTime <- data.frame(item = as.integer(substring(row.names(paramTime), 5,8)), 
                          timeIntensity = paramTime[,1],
                          seTimeIntensity = paramTime[,2]
                          )

## Modelparemeter

modelParams <- data.frame(IrVar = modelIr$variance, 
           IrRel = modelIr$EAP.rel, 
           RtTau2 = data.frame(VarCorr(modelRt))%>%
             filter(grp=="day:subject_id") %>% pull(vcov),
           RtSigma2 = sigma(modelRt)^2,
           estDate = format(as.POSIXct(Sys.time(), tz = "UTC"),
                            "%Y-%m-%dT%H:%M:%OS3Z")
           )

str(itemParResp)
str(itemFit)
str(itemParTime)
str(itemStack)
modelIr$item

# 6. Itemparameter extrahieren
params <- modelIr$item %>% mutate(item = as.integer(item) ) %>% 
  merge(.,itemParResp, by = "item") %>%
  merge(.,itemFit, by = "item") %>%
  merge(.,itemParTime, by = "item") %>%
  merge(.,itemStack, by = "item", all = T) %>%
  mutate(N = as.integer(ifelse(is.na(N), 0, N)),
         threshold_2 = ifelse(is.na(xsi2), mean(itemParResp$xsi2),
                                ifelse(xsi2 < -5,-5, 
                                       ifelse(xsi2 > 2,2,
                                              xsi2))),
         sexsi2 = ifelse(is.na(sexsi2) | sexsi2 > 1, 1, sexsi2),
         xsipv = threshold_2 + purrr::map_dbl(sexsi2,function(x) rnorm(1, mean = 0 , sd = x)  ),
         threshold_2pv = ifelse(is.na(xsipv), 0, 
                              ifelse(xsipv < -5,-5, 
                                     ifelse(xsipv > 2,2,
                                            xsipv))),
         threshold_1 = threshold_2-2 + rnorm(length(threshold_2),mean = 0, 0.5 ),
         weight = ifelse(is.na(N) | is.na(RMSD),1,
                         ifelse(N > 150 & RMSD > 0.08,0,1 )),
         points_first_try = as.integer(round((threshold_2 + 7)*10)),
         points_later_try = as.integer(round((threshold_1 + 7)*10)),
         first_threshold = as.integer(2000),
         timeIntensity = ifelse(is.na(timeIntensity),
                                mean(itemParTime$timeIntensity),timeIntensity),
         seTimeIntensity = ifelse(is.na(seTimeIntensity),
                                sigma(modelRt)^2,seTimeIntensity),
         estDate = format(as.POSIXct(Sys.time(), tz = "UTC"),
                       "%Y-%m-%dT%H:%M:%OS3Z")#, 
         #estDate = "2025-11-08T15:08:46.999Z"
         ) %>% 
  select(item, N, M, threshold_1, threshold_2pv, threshold_2, 
         sexsi2, timeIntensity, seTimeIntensity, RMSD, 
         weight, estDate, 
         points_first_try, points_later_try, 
         first_threshold)

con <- dbConnect(SQLite(), "../data/test.db")  # Pfad zur DB
##dbWriteTable(con, "model_parameters", modelParams)
##dbExecute(con, "DROP TABLE IF EXISTS model_parameters")
dbWriteTable(con, "model_parameters", modelParams, append = TRUE)
# 6. Tabelle löschen und neu schreiben

dbExecute(con, "DROP TABLE IF EXISTS item_parameters")
dbWriteTable(con, "item_parameters", params)
# 7. Verbindung schließen
dbDisconnect(con)

