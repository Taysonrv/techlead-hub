ALTER TABLE "CalendarMeeting"
ADD COLUMN "reminderMinutes" INTEGER NOT NULL DEFAULT 15;

ALTER TABLE "CalendarMeeting"
ADD CONSTRAINT "CalendarMeeting_reminderMinutes_check"
CHECK ("reminderMinutes" IN (5, 10, 15, 30));
