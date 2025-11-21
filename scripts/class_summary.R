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
#summary(irMx)
id <- ir  %>%  dplyr::select(subject_id, class_id, day)
AXsi <- cbind(0, params[match(as.integer(colnames(irMx)), params$item),
                        "threshold_2"])
items <- params[match(as.integer(colnames(irMx)), params$item),"item"]


I <- ncol(irMx)
B <- array(0, dim = c(I, 2, 1))
B[, 2, 1] <- 1
dimnames(B) <- list(c(items), c("Cat0","Cat1" ),c("Dim01"))
#AXsi[,2] <- 1
hist(AXsi[,2])

input <- list(resp=irMx, AXsi=AXsi, B=B )
wle2b <- data.frame(TAM::tam.mml.wle(input ))
summary(data.frame(wle2b))
personIr <- cbind(id, wle2b)

hist(data.frame(wle2b)$theta)
#summary(AXsi)
#hist(AXsi[,2])
summary(data.frame(wle2b))
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

prior_fluency =  0.6495005
prior_speeded = 0.3504995 
log_fluency   <- dmvnorm(XZ, mean = c(1.7571100,-0.3145346), 
                     sigma = matrix(c(1.34918394,0.05004342,
                                      0.05004342,0.08337972), ncol=2), 
                     log =T) + log(prior_fluency)

log_speeded  <- dmvnorm(XZ, mean = c(0.4335945, -0.5800333), 
                     sigma = matrix(c(1.5848814,-0.2562105,
                                      -0.2562105,0.3672793), ncol=2), 
                     log =T) + log(prior_speeded)

logsumexp <- function(a, b) {
  m <- pmax(a, b)
  m + log(exp(a - m) + exp(b - m))
}

log_norm <- logsumexp(log_fluency, log_speeded)

person$P_fluency <- exp(log_fluency - log_norm)
person$P_speeded <- exp(log_speeded - log_norm)
summary(person)

class_summary <- person %>% data.frame() %>%
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
  filter(r <= 3) %>% 
  tidyr::pivot_wider(names_from = r, 
                     values_from = c(theta, theta_se, zeta, P_fluency,n_obs, day), values_fill = NA) %>% 
  mutate(Trend = ifelse(is.na(day_2), NA,
                        ifelse(
                          is.na(day_3), round(theta_2 - theta_1),
                        round(theta_2 - theta_2)) ),
         theta = ifelse(is.na(day_2), theta_1,
                       ifelse(
                         is.na(day_3), theta_2,
                         theta_3) ),
         theta_se = ifelse(is.na(theta_se_2), theta_se_1,
                        ifelse(
                          is.na(theta_se_3), theta_se_2,
                          theta_se_3) ),
         h = round(theta+theta_se),
         h = ifelse(h > 10, 10, ifelse(h < 1, 1, h)),
         l = round(theta-theta_se),
         l = ifelse(l > 10, 10, ifelse(l < 1, 1, l)),
         last_test = ifelse(is.na(day_2), day_1,
                        ifelse(
                          is.na(day_3), day_2,
                          day_3)), 
         speeded = ifelse(rowSums(cbind(P_fluency_1 < 30,
                                        P_fluency_2 < 30,
                                        P_fluency_3 < 30), na.rm = TRUE) > 0, 0,1)
         ) %>% 
  select(class_id,subject_id,last_test,theta,h,l, Trend, speeded)
summary(class_summary )
names(class_summary)




con <- dbConnect(SQLite(), "../data/test.db")  # Pfad zur DB

#dbExecute(con, "DROP TABLE IF EXISTS class_summary")
dbExecute(con, "
  CREATE TABLE IF NOT EXISTS class_summary (
    subject_id TEXT,
    class_id TEXT,
    day TEXT,
    theta REAL,
    zeta REAL,
    P_fluency REAL,
    estDate TEXT,
    PRIMARY KEY (subject_id, class_id, day)
  )
")

dbWriteTable(con, "temp_class_summary", class_summary, overwrite = TRUE)

dbExecute(con, "
  INSERT OR REPLACE INTO class_summary (subject_id, class_id, day, theta, zeta, P_fluency, estDate)
  SELECT subject_id, class_id, day, theta, zeta, P_fluency, estDate
  FROM temp_class_summary
")

dbExecute(con, "DROP TABLE temp_class_summary")



