CREATE TABLE notification_preferences (
 singleton INTEGER PRIMARY KEY CHECK (singleton=1),
 time_zone TEXT NOT NULL
);
