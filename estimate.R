# estimate_pcm.R
setwd("C:/Users/mulrlude/Documents/App lesekids/lesekids_projekt/lesekids")
library(DBI)
library(RSQLite)  # oder RPostgres, je nach DB
library(TAM)

# 1. DB-Verbindung
con <- dbConnect(SQLite(), "data/test.db")  # Pfad zur DB

# 2. Daten laden
data <- dbGetQuery(con, "SELECT subject_id, item, DATE(timestamp) AS date, score FROM clean_responses")

# 3. Breite Datenstruktur erzeugen
library(tidyr)
library(dplyr)

wide_data <- data %>% 
  group_by(item) %>% 
  mutate(n_item = n() ) %>% 
  group_by(subject_id, date) %>%
  mutate(n_sub = n() ) %>% 
  group_by(subject_id, n_item) %>% 
  mutate(n_sub_item = n() ) %>%
  ungroup() %>% 
  filter(n_item > 10 & n_sub > 5 & n_sub_item <= 1) %>%
  mutate(score = ifelse(score == 1, 0, ifelse(score == 2, 1, score)) ) %>% 
  select(-n_item, -n_sub, -n_sub_item ) %>%
  tidyr::pivot_wider(names_from = item, values_from = score, values_fill = NA) %>%
  dplyr::select(-subject_id, -date)

# 4. Modell schätzen
mod <- TAM::tam.mml(as.matrix(wide_data), verbose= F)

# 5. item flags 
fit1  <- IRT.itemfit(mod)


itemFit <- fit1$RMSD %>% 
  mutate(RMSD = Group1) %>% 
  select(item, RMSD)

# 6. Itemparameter extrahieren
params <- mod$item %>% merge(.,itemFit, by = "item") %>%  
  mutate(item = as.integer(item),
         N = as.integer(N),
         threshold_2 = ifelse(AXsi_.Cat1 < -5,-5, 
                              ifelse(AXsi_.Cat1 > 2,2,
                                     AXsi_.Cat1
                                     )),
         threshold_1 = threshold_2-2 + rnorm(length(threshold_2),mean = 0, 0.5 ),
         weight = ifelse(N > 150 & RMSD > 0.08,0,1 ),
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
summary(params)
# 6. Tabelle löschen und neu schreiben
dbExecute(con, "DROP TABLE IF EXISTS item_parameters")
dbWriteTable(con, "item_parameters", params)

# 7. Verbindung schließen
dbDisconnect(con)
