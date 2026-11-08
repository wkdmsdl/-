CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(100) NOT NULL,   -- bcrypt 해시 저장
    nickname      VARCHAR(50),
    created_at    TIMESTAMP DEFAULT NOW()
);

-- 건강정보(민감정보)는 따로 두고, 암호화한 문자열만 저장
CREATE TABLE user_health (
    user_id       INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    allergies_enc TEXT NOT NULL            -- AES-256-GCM으로 암호화한 알레르기 목록
);

-- 동의 이력
CREATE TABLE consents (
    id        SERIAL PRIMARY KEY,
    user_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type      VARCHAR(20) NOT NULL,        -- 'BASIC' 또는 'HEALTH'
    agreed    BOOLEAN NOT NULL,
    agreed_at TIMESTAMP DEFAULT NOW()
);
