# estimate.R
setwd("C:/Users/mulrlude/Documents/App lesekids/lesekids_projekt/lesekids/scripts")
#setwd("/home/appuser/lesekids/scripts")
rm(list = ls())
library(DBI)
library(RSQLite)  # oder RPostgres, je nach DB
library(TAM)
library(tidyr)
library(dplyr)
library(lme4)
library(ggplot2) # nicht nötig
# 1. DB-Verbindung
con <- dbConnect(SQLite(), "../data/test.db")  # Pfad zur DB

# 2. Daten laden
dataIr <- dbGetQuery(con, "SELECT c.subject_id, s.class_id, c.item, c.day, c.score
  FROM clean_responses AS c
  JOIN subject_class AS s
    ON c.subject_id = s.subject_id") 
dataRt <- dbGetQuery(con, "SELECT c.subject_id,
         s.class_id,
         c.item,
         DATE(c.timestamp) AS day,
         c.rt
  FROM clean_resp_first AS c
  JOIN subject_class AS s
    ON c.subject_id = s.subject_id
  WHERE c.question_type = 'mc'" )

params <- dbGetQuery(con, "SELECT item, threshold_2, timeIntensity FROM item_parameters" )

modelParams <- dbGetQuery(con, "SELECT RtTau2, RtSigma2
FROM model_parameters
WHERE estDate = (
  SELECT MAX(estDate)
  FROM model_parameters
);" )

dbDisconnect(con)
## Speed an accuracy
5779 + 9254
6211 + 10042
data <- dataIr %>% 
  merge(.,dataRt, by = c("subject_id","class_id", "day", "item")) %>%
  merge(.,params, by = c("item") ) %>% 
  mutate(rt2 = log(rt/1000), 
         rt2 = ifelse(rt2 > 6, 6, rt2))
  
ir <- data %>% 
  select(subject_id,day,class_id, item,score) %>% 
  group_by(subject_id,class_id, day) %>%
  mutate(n_sub = n() ) %>% 
  ungroup() %>% 
  filter(n_sub > 5) %>%
  mutate(score = ifelse(score == 1, 0, 
                        ifelse(score == 2, 1, 
                               ifelse(score == 0,0,NA)
                               )
                        )
         ) %>% 
  select(-n_sub) %>%
  tidyr::pivot_wider(names_from = item, 
                     values_from = score, values_fill = NA) 

irMx <- ir  %>%  
  dplyr::select(-subject_id, -class_id, -day) %>% 
  as.matrix()
table(irMx)
#summary(irMx)
id <- ir  %>%  dplyr::select(subject_id, class_id, day)
AXsi <- cbind(0, params[match(as.integer(colnames(irMx)), params$item),
                        "threshold_2"])
items <- params[match(as.integer(colnames(irMx)), params$item),"item"]

mod_new <- tam(irMx, irtmodel = "1PL", xsi.fixed = AXsi)
wle2b <- data.frame(TAM::tam.mml.wle(mod_new ))

personIr <- cbind(id, wle2b)

### Time modelling

rtMx <- data %>% 
  select(subject_id,class_id, day,item,rt2) %>%
  inner_join(params %>% select(item, timeIntensity), 
             by="item") %>%
  mutate(resid  = rt2 - timeIntensity)

tau2_hat <- modelParams$RtTau2
sigma2_hat <- modelParams$RtTau2
## 3) Pro Person EB/BLUP berechnen
personRt <- rtMx %>%
  group_by(subject_id, class_id, day) %>%
  summarise(n_obs = n(),
            mean_resid = mean(resid),
            .groups="drop") %>%
  mutate(shrink = tau2_hat / (tau2_hat + sigma2_hat / n_obs),
         u_hat   = shrink * mean_resid,
         zeta_se    = sqrt( 1 / (1/tau2_hat + n_obs/sigma2_hat)),
         # je nach Konvention: Speed als -u (kleiner u = schneller RT)
         zeta = -u_hat
         )

# Ergebnis: pro Person u_hat (Random-Intercept) und tau_speed (latente Speed)
person <- merge(personIr,personRt, by = c("subject_id","class_id" ,"day"))
#save(person, file = "../../R-imports/person.RData")
#plot(person[,c("theta", "zeta")])
### Time modelling


XZ <- person[, c("theta","zeta")]

prior_fluency =  0.6800643
prior_speeded = 0.3199357 
log_fluency   <- dmvnorm(XZ, mean = c(0.4869118,-0.3086769), 
                     sigma = matrix(c(1.09542104,0.06760958,
                                      0.06760958,0.08364738), ncol=2), 
                     log =T) + log(prior_fluency)

log_speeded  <- dmvnorm(XZ, mean = c(-0.8602502, 0.5984023), 
                     sigma = matrix(c(1.1619103 ,-0.2032051,
                                      -0.2032051,0.3614299), ncol=2), 
                     log =T) + log(prior_speeded)

logsumexp <- function(a, b) {
  m <- pmax(a, b)
  m + log(exp(a - m) + exp(b - m))
}

log_norm <- logsumexp(log_fluency, log_speeded)

person$P_fluency <- exp(log_fluency - log_norm)
person$P_speeded <- exp(log_speeded - log_norm)
summary(person)
hist(person$P_fluency)
hist(person$P_speeded)

tmp <- person %>% data.frame() %>%
  select(subject_id,class_id, day, theta, error, zeta, P_fluency, n_obs) %>% 
  mutate(theta = round(scale(theta)*2+5),
         theta = ifelse(theta > 10, 10, ifelse(theta < 1, 1, theta)),
         theta_se = (error* (1/sd(person$theta)))*2,
         zeta = round(scale(zeta)*2+5),
         zeta = ifelse(zeta > 10, 10, ifelse(zeta < 1, 1, zeta)),
         P_fluency = round(P_fluency*100),
         estDate = format(as.POSIXct(Sys.time(), tz = "UTC"),
                          "%Y-%m-%dT%H:%M:%OS3Z")
         ) %>% arrange(desc(day)) %>% select(-error) %>%
  group_by(subject_id,class_id) %>% 
  mutate(r = row_number()) %>% 
  filter(r <= 10) %>% 
  tidyr::pivot_wider(names_from = r, 
                     values_from = c(theta, theta_se, zeta, P_fluency,n_obs, day), 
                     values_fill = NA) %>% data.frame()
if(is.null(tmp$theta_4)) tmp$theta_4 <- NA
if(is.null(tmp$theta_5)) tmp$theta_5 <- NA
if(is.null(tmp$theta_6)) tmp$theta_6 <- NA
if(is.null(tmp$theta_7)) tmp$theta_7 <- NA
if(is.null(tmp$theta_8)) tmp$theta_8 <- NA
if(is.null(tmp$theta_9)) tmp$theta_9 <- NA
if(is.null(tmp$theta_10)) tmp$theta_10 <- NA

if(is.null(tmp$zeta_4)) tmp$zeta_4 <- NA
if(is.null(tmp$zeta_5)) tmp$zeta_5 <- NA
if(is.null(tmp$zeta_6)) tmp$zeta_6 <- NA
if(is.null(tmp$zeta_7)) tmp$zeta_7 <- NA
if(is.null(tmp$zeta_8)) tmp$zeta_8 <- NA
if(is.null(tmp$zeta_9)) tmp$zeta_9 <- NA
if(is.null(tmp$zeta_10)) tmp$zeta_10 <- NA

if(is.null(tmp$day_4)) tmp$day_4 <- NA
if(is.null(tmp$day_5)) tmp$day_5 <- NA
if(is.null(tmp$day_6)) tmp$day_6 <- NA
if(is.null(tmp$day_7)) tmp$day_7 <- NA
if(is.null(tmp$day_8)) tmp$day_8 <- NA
if(is.null(tmp$day_9)) tmp$day_9 <- NA
if(is.null(tmp$day_10)) tmp$day_10 <- NA

class_summary <- tmp %>%
  mutate( theta = theta_1,
         zeta = zeta_1,
         theta_se = theta_se_1,
         h = round(theta+theta_se),
         h = ifelse(h > 10, 10, ifelse(h < 1, 1, h)),
         l = round(theta-theta_se),
         l = ifelse(l > 10, 10, ifelse(l < 1, 1, l)),
         last_test = day_1) %>% 
  select(subject_id,class_id,last_test,theta,h,l,zeta, P_fluency_1,
         theta_1, theta_2, theta_3, theta_4, theta_5, 
         theta_6, theta_7, theta_8,theta_9, theta_10,
         zeta_1, zeta_2, zeta_3,zeta_4, zeta_5,
         zeta_6,zeta_7,zeta_8,zeta_9,zeta_10,
         day_1,day_2,day_3, day_4,day_5,
         day_6, day_7,day_8,day_9,day_10, 
         estDate)

#"Liest schnell für das Verstehensniveau -> eher auf Verstehen achten", 
#"Liest langsam für das Verstehensniveau -> auch Leseflüssigkeit üben", 
#"Bearbeitet Aufgaben nur flüchtig -> Kind für üben motivieren"


con <- dbConnect(SQLite(), "../data/test.db")  # Pfad zur DB

#dbExecute(con, "DROP TABLE IF EXISTS class_summary")
dbExecute(con, "
  CREATE TABLE IF NOT EXISTS class_summary (
    subject_id INTEGER,
    class_id INTEGER,
    last_test TEXT,
    theta INTEGER,
    h INTEGER,
    l INTEGER,
    zeta INTEGER, 
    P_fluency_1 INTEGER,
    theta_1 INTEGER, 
    theta_2 INTEGER, 
    theta_3 INTEGER,
    theta_4 INTEGER, 
    theta_5 INTEGER, 
    theta_6 INTEGER,
    theta_7 INTEGER,
    theta_8 INTEGER,
    theta_9 INTEGER,
    theta_10 INTEGER,
    zeta_1 INTEGER, 
    zeta_2 INTEGER, 
    zeta_3 INTEGER,
    zeta_4 INTEGER, 
    zeta_5 INTEGER, 
    zeta_6 INTEGER,
    zeta_7 INTEGER, 
    zeta_8 INTEGER, 
    zeta_9 INTEGER,
    zeta_10 INTEGER, 
    day_1 TEXT,
    day_2 TEXT,
    day_3 TEXT,
    day_4 TEXT,
    day_5 TEXT,
    day_6 TEXT,
    day_7 TEXT,
    day_8 TEXT,
    day_9 TEXT,
    day_10 TEXT,
    estDate TEXT,
    PRIMARY KEY (subject_id, class_id)
  )
")

dbWriteTable(con, "temp_class_summary", class_summary, overwrite = TRUE)

dbExecute(con, "
  INSERT OR REPLACE INTO class_summary (
    subject_id,
    class_id,
    last_test,
    theta,
    h,
    l,
    zeta, 
    P_fluency_1,
    theta_1, theta_2, theta_3, theta_4, theta_5,
    theta_6, theta_7, theta_8, theta_9, theta_10,
    zeta_1, zeta_2, zeta_3, zeta_4, zeta_5,
    zeta_6, zeta_7, zeta_8, zeta_9, zeta_10,
    day_1, day_2, day_3, day_4, day_5,
    day_6, day_7, day_8, day_9, day_10,
    estDate
)
SELECT
    subject_id,
    class_id,
    last_test,
    theta,
    h,
    l,
    zeta, 
    P_fluency_1,
    theta_1, theta_2, theta_3, theta_4, theta_5,
    theta_6, theta_7, theta_8, theta_9, theta_10,
    zeta_1, zeta_2, zeta_3, zeta_4, zeta_5,
    zeta_6, zeta_7, zeta_8, zeta_9, zeta_10,
    day_1, day_2, day_3, day_4, day_5,
    day_6, day_7, day_8, day_9, day_10,
    estDate
FROM temp_class_summary;
")

dbExecute(con, "DROP TABLE temp_class_summary")



