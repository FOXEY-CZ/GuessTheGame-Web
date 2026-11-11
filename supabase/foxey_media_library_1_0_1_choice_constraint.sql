-- Media Library 1.0.1: reserve choice=4 for rights-quarantine no-penalty skip.
-- RPC handlers already verify that only an unapproved image can use it.
ALTER TABLE arcade_private.quizoria_survival_events
 DROP CONSTRAINT quizoria_survival_events_choice_check;
ALTER TABLE arcade_private.quizoria_survival_events
 ADD CONSTRAINT quizoria_survival_events_choice_check CHECK (choice BETWEEN 0 AND 4);
ALTER TABLE arcade_private.quizoria_endless_events
 DROP CONSTRAINT quizoria_endless_events_choice_check;
ALTER TABLE arcade_private.quizoria_endless_events
 ADD CONSTRAINT quizoria_endless_events_choice_check CHECK (choice BETWEEN 0 AND 4);
