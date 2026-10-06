CREATE TABLE users (
    id          SERIAL PRIMARY KEY,
    email       VARCHAR(255) UNIQUE NOT NULL,
    nickname    VARCHAR(50),
    allergies   TEXT[] DEFAULT '{}',
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE menus (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    restaurant  VARCHAR(100),
    raw_text    TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ingredients (
    id          SERIAL PRIMARY KEY,
    menu_id     INT REFERENCES menus(id) ON DELETE CASCADE,
    name        VARCHAR(50) NOT NULL,
    allergen    VARCHAR(30)
);
