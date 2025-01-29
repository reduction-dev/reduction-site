-- Migration number: 0001 	 2025-01-29T15:56:06.084Z

CREATE TABLE newsletter_sign_ups (
    email TEXT PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
