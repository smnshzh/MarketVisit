-- ایجاد جداول برای ثبت توضیحات کاربران و گروه‌بندی مغازه‌ها

-- جدول کاربران
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- ایجاد ایندکس برای کاربران
CREATE INDEX IF NOT EXISTS idx_users_username 
ON users(username);

CREATE INDEX IF NOT EXISTS idx_users_email 
ON users(email);

-- جدول sessions برای مدیریت لاگین
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_token 
ON user_sessions(session_token);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id 
ON user_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_expires 
ON user_sessions(expires_at);

-- جدول برای توضیحات کاربران
CREATE TABLE IF NOT EXISTS store_user_comments (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    user_latitude FLOAT,
    user_longitude FLOAT,
    comment TEXT NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES city_categories(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ایجاد ایندکس برای توضیحات
CREATE INDEX IF NOT EXISTS idx_comments_store_id 
ON store_user_comments(store_id);

CREATE INDEX IF NOT EXISTS idx_comments_user_id 
ON store_user_comments(user_id);

CREATE INDEX IF NOT EXISTS idx_comments_created_at 
ON store_user_comments(created_at DESC);

-- جدول برای گروه‌بندی مغازه‌های تکراری
CREATE TABLE IF NOT EXISTS store_groups (
    id SERIAL PRIMARY KEY,
    group_code VARCHAR(50) UNIQUE NOT NULL,
    group_name VARCHAR(500),
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- جدول ارتباط مغازه‌ها با گروه‌ها
CREATE TABLE IF NOT EXISTS store_group_members (
    id SERIAL PRIMARY KEY,
    group_code VARCHAR(50) NOT NULL,
    store_id INTEGER NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES city_categories(id) ON DELETE CASCADE,
    FOREIGN KEY (group_code) REFERENCES store_groups(group_code) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(group_code, store_id)
);

-- ایجاد ایندکس‌ها برای گروه‌ها
CREATE INDEX IF NOT EXISTS idx_group_members_group_code 
ON store_group_members(group_code);

CREATE INDEX IF NOT EXISTS idx_group_members_store_id 
ON store_group_members(store_id);

CREATE INDEX IF NOT EXISTS idx_group_members_primary 
ON store_group_members(is_primary) WHERE is_primary = TRUE;

-- ==================== جداول Market Visit (اختصاص مغازه‌ها به کاربران) ====================

-- جدول اختصاص مغازه‌ها به کاربران (Market Visit)
CREATE TABLE IF NOT EXISTS assigned_stores (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    store_id INTEGER NOT NULL,
    assigned_date DATE NOT NULL,
    visit_date DATE,
    status VARCHAR(50) DEFAULT 'pending',
    notes TEXT,
    assigned_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (store_id) REFERENCES city_categories(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(user_id, store_id, assigned_date)
);

-- ایجاد ایندکس‌ها برای assigned_stores
CREATE INDEX IF NOT EXISTS idx_assigned_stores_user_id 
ON assigned_stores(user_id);

CREATE INDEX IF NOT EXISTS idx_assigned_stores_store_id 
ON assigned_stores(store_id);

CREATE INDEX IF NOT EXISTS idx_assigned_stores_assigned_date 
ON assigned_stores(assigned_date);

CREATE INDEX IF NOT EXISTS idx_assigned_stores_status 
ON assigned_stores(status);

-- جدول اطلاعات و عکس‌های مارکت ویزیت
CREATE TABLE IF NOT EXISTS store_visit_data (
    id SERIAL PRIMARY KEY,
    assignment_id INTEGER NOT NULL,
    store_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    visit_date DATE NOT NULL,
    visit_time TIME,
    image_urls TEXT[],
    additional_info JSONB,
    latitude FLOAT,
    longitude FLOAT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assignment_id) REFERENCES assigned_stores(id) ON DELETE CASCADE,
    FOREIGN KEY (store_id) REFERENCES city_categories(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ایجاد ایندکس‌ها برای store_visit_data
CREATE INDEX IF NOT EXISTS idx_visit_data_assignment_id 
ON store_visit_data(assignment_id);

CREATE INDEX IF NOT EXISTS idx_visit_data_store_id 
ON store_visit_data(store_id);

-- ==================== جدول درخواست‌های غیرفعال کردن مغازه‌ها ====================

-- جدول درخواست‌های غیرفعال کردن مغازه‌ها
CREATE TABLE IF NOT EXISTS store_deactivation_requests (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL,
    store_token VARCHAR(255),
    requested_by INTEGER NOT NULL,
    reason TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    reviewed_by INTEGER,
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES city_categories(id) ON DELETE CASCADE,
    FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ایجاد ایندکس‌ها برای store_deactivation_requests
CREATE INDEX IF NOT EXISTS idx_deactivation_requests_store_id 
ON store_deactivation_requests(store_id);

CREATE INDEX IF NOT EXISTS idx_deactivation_requests_store_token 
ON store_deactivation_requests(store_token);

CREATE INDEX IF NOT EXISTS idx_deactivation_requests_status 
ON store_deactivation_requests(status);

CREATE INDEX IF NOT EXISTS idx_deactivation_requests_requested_by 
ON store_deactivation_requests(requested_by);

CREATE INDEX IF NOT EXISTS idx_visit_data_user_id 
ON store_visit_data(user_id);

CREATE INDEX IF NOT EXISTS idx_visit_data_visit_date 
ON store_visit_data(visit_date);

-- ==================== اضافه کردن فیلدهای جدید به جدول city_categories ====================

-- اضافه کردن فیلدهای جدید به جدول city_categories (اگر وجود نداشته باشند)
DO $$
BEGIN
    -- اضافه کردن فیلد پلاک
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'city_categories' AND column_name = 'place_plate_number'
    ) THEN
        ALTER TABLE city_categories ADD COLUMN place_plate_number VARCHAR(50);
    END IF;
    
    -- اضافه کردن فیلد کد پستی
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'city_categories' AND column_name = 'place_postal_code'
    ) THEN
        ALTER TABLE city_categories ADD COLUMN place_postal_code VARCHAR(20);
    END IF;
    
    -- اضافه کردن فیلد وضعیت (فعال/غیرفعال)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'city_categories' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE city_categories ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
    END IF;
    
    -- اضافه کردن فیلد عکس‌ها (آرایه URL عکس‌ها)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'city_categories' AND column_name = 'place_images'
    ) THEN
        ALTER TABLE city_categories ADD COLUMN place_images TEXT[];
    END IF;
    
    -- اضافه کردن فیلد کاربر ثبت‌کننده
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'city_categories' AND column_name = 'created_by_user_id'
    ) THEN
        ALTER TABLE city_categories ADD COLUMN created_by_user_id INTEGER;
        ALTER TABLE city_categories ADD CONSTRAINT fk_city_categories_created_by 
            FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    
    -- ایجاد ایندکس برای وضعیت
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'city_categories' AND indexname = 'idx_city_categories_is_active'
    ) THEN
        CREATE INDEX idx_city_categories_is_active ON city_categories(is_active);
    END IF;
    
    -- اضافه کردن فیلد کارگاه دارد/ندارد
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'city_categories' AND column_name = 'has_workshop'
    ) THEN
        ALTER TABLE city_categories ADD COLUMN has_workshop BOOLEAN DEFAULT FALSE;
        UPDATE city_categories SET has_workshop = FALSE WHERE has_workshop IS NULL;
        CREATE INDEX idx_city_categories_has_workshop ON city_categories(has_workshop);
    END IF;
    
    -- اضافه کردن فیلد place_full_data برای ذخیره داده‌های کامل از API
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'city_categories' AND column_name = 'place_full_data'
    ) THEN
        ALTER TABLE city_categories ADD COLUMN place_full_data JSONB;
    END IF;
    
    RAISE NOTICE 'فیلدهای جدید به جدول city_categories اضافه شدند!';
END $$;

-- نمایش پیام موفقیت
DO $$
BEGIN
    RAISE NOTICE 'جداول با موفقیت ایجاد شدند!';
END $$;

