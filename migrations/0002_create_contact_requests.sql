-- Migration number: 0002 	 2025-01-29T18:57:29.621Z

CREATE TABLE contact_requests (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    company TEXT,
    phone TEXT,
    email TEXT NOT NULL,
    use_case TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
