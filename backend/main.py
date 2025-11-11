from fastapi import FastAPI, HTTPException, Depends, Cookie, Header, UploadFile, File, Request
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List, Union
import psycopg2
from psycopg2.extras import RealDictCursor
import hashlib
import secrets
import os
from datetime import datetime, timedelta, date
import json
import math
import time
from dotenv import load_dotenv
import jdatetime
import requests
import traceback

# بارگذاری متغیرهای محیطی از فایل .env
load_dotenv()

# تابع تبدیل تاریخ میلادی به شمسی
def to_jalali_date(date_obj):
    """تبدیل تاریخ میلادی به شمسی"""
    if date_obj is None:
        return None
    if isinstance(date_obj, str):
        try:
            date_obj = datetime.strptime(date_obj, "%Y-%m-%d").date()
        except:
            return date_obj
    if isinstance(date_obj, datetime):
        date_obj = date_obj.date()
    if isinstance(date_obj, date):
        jalali = jdatetime.date.fromgregorian(date=date_obj)
        return jalali.strftime("%Y/%m/%d")
    return str(date_obj)

def to_jalali_datetime(datetime_obj):
    """تبدیل datetime میلادی به شمسی"""
    if datetime_obj is None:
        return None
    if isinstance(datetime_obj, str):
        try:
            datetime_obj = datetime.fromisoformat(datetime_obj.replace('Z', '+00:00'))
        except:
            return datetime_obj
    if isinstance(datetime_obj, datetime):
        jalali = jdatetime.datetime.fromgregorian(datetime=datetime_obj)
        return jalali.strftime("%Y/%m/%d %H:%M:%S")
    return str(datetime_obj)

app = FastAPI(title="Store Management API", version="1.0.0")

# Middleware برای لاگ کردن تمام درخواست‌ها
@app.middleware("http")
async def log_requests_middleware(request: Request, call_next):
    """Middleware برای لاگ کردن تمام درخواست‌های API"""
    start_time = time.time()
    
    # دریافت اطلاعات درخواست
    method = request.method
    path = request.url.path
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    # خواندن body درخواست (اگر وجود داشته باشد) - فقط برای logging
    # توجه: نمی‌توانیم body را بخوانیم چون بعد FastAPI نمی‌تواند آن را بخواند
    # پس فقط path و method را log می‌کنیم
    request_body = None
    
    # اجرای درخواست
    try:
        response = await call_next(request)
        status_code = response.status_code
        
        # خواندن body پاسخ (اگر امکان‌پذیر باشد)
        response_body = None
        try:
            if hasattr(response, 'body'):
                response_body = response.body.decode()[:1000]  # محدود کردن به 1000 کاراکتر
        except:
            pass
        
        # محاسبه مدت زمان اجرا
        duration_ms = (time.time() - start_time) * 1000
        
        # دریافت اطلاعات کاربر (اگر authenticated باشد)
        user_id = None
        username = None
        try:
            # تلاش برای دریافت session token
            session_token = request.cookies.get("session_token") or request.headers.get("authorization", "").replace("Bearer ", "")
            if session_token:
                # بررسی session در دیتابیس
                conn = get_db_connection()
                try:
                    with conn.cursor(cursor_factory=RealDictCursor) as cur:
                        cur.execute("""
                            SELECT u.id, u.username 
                            FROM user_sessions s
                            JOIN users u ON s.user_id = u.id
                            WHERE s.session_token = %s AND s.expires_at > CURRENT_TIMESTAMP
                        """, (session_token,))
                        user = cur.fetchone()
                        if user:
                            user_id = user["id"]
                            username = user["username"]
                except:
                    pass
                finally:
                    conn.close()
        except:
            pass
        
        return response
        
    except Exception as e:
        # لاگ کردن خطا در کنسول
        error_traceback = traceback.format_exc()
        print(f"[ERROR] {type(e).__name__}: {str(e)} - Endpoint: {path}")
        if error_traceback:
            print(error_traceback)
        raise

# Mount static files for uploaded images
import os
from pathlib import Path
uploads_dir = Path("uploads")
uploads_dir.mkdir(exist_ok=True)
uploads_dir.joinpath("comments").mkdir(exist_ok=True)
try:
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
    print("✅ Static files mounted successfully")
except Exception as e:
    error_msg = f"Warning: Could not mount static files: {e}"
    print(error_msg)

# تنظیمات CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://survey.dbaraka.shop",
        "http://survey.dbaraka.shop",
        "https://survey-backend.dbaraka.shop",
        "http://survey-backend.dbaraka.shop",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,  # Cache preflight requests for 1 hour
)

# تنظیمات دیتابیس
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "5432")),
    "database": os.getenv("DB_NAME", "postgres"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", "Saman0866"),
}

def get_db_connection():
    """ایجاد اتصال به دیتابیس"""
    return psycopg2.connect(**DB_CONFIG)

# ==================== Models ====================

class RegisterRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    fullName: Optional[str] = None

class LoginRequest(BaseModel):
    username: str
    password: str

class CommentRequest(BaseModel):
    storeId: int
    comment: str
    rating: Optional[int] = None
    userLat: Optional[float] = None
    userLng: Optional[float] = None
    imageUrls: Optional[List[str]] = None

class GroupRequest(BaseModel):
    storeIds: List[int]
    groupCode: Optional[str] = None
    groupName: Optional[str] = None

class AssignStoreRequest(BaseModel):
    userId: int
    storeTokens: List[str]  # تغییر از storeIds به storeTokens
    assignedDate: str  # YYYY-MM-DD
    notes: Optional[str] = None

class VisitDataRequest(BaseModel):
    assignmentId: int
    visitDate: str  # YYYY-MM-DD
    visitTime: Optional[str] = None  # HH:MM:SS
    imageUrls: Optional[List[str]] = None
    additionalInfo: Optional[dict] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class RegisterStoreRequest(BaseModel):
    name: str
    address: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    category: str  # category_display
    categorySlug: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    plateNumber: Optional[str] = None
    postalCode: Optional[str] = None
    isActive: Optional[bool] = True
    imageUrls: Optional[List[str]] = None
    placeFullData: Optional[dict] = None  # داده‌های کامل از API (مثل بلد)

# ==================== Helper Functions ====================

def hash_password(password: str) -> str:
    """Hash کردن پسورد با SHA-256"""
    return hashlib.sha256(password.encode()).hexdigest()

def generate_session_token() -> str:
    """تولید session token"""
    return secrets.token_urlsafe(32)

def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """محاسبه فاصله بین دو نقطه جغرافیایی (Haversine formula)"""
    import math
    R = 6371000  # شعاع زمین به متر
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2 +
        math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
        math.sin(d_lon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c  # فاصله به متر

def extract_neighborhood(address: str, city_name: str, seo_details: Optional[dict]) -> str:
    """استخراج محله از seo_details یا address"""
    # اول از seo_details استخراج کن
    if seo_details:
        try:
            if isinstance(seo_details, str):
                seo = json.loads(seo_details)
            else:
                seo = seo_details
            
            if seo.get("schemas") and len(seo["schemas"]) > 0:
                locality = seo["schemas"][0].get("address", {}).get("addressLocality")
                if locality:
                    locality = locality.replace("محله ", "").strip()
                    if locality and locality != city_name:
                        return locality
        except:
            pass
    
    # اگر از seo_details پیدا نشد، از آدرس استخراج کن
    if not address or address == "آدرس در دسترس نیست":
        return city_name or "نامشخص"
    
    parts = address.split("،")
    if len(parts) > 1:
        first_part = parts[1].strip()
        for word in ["محله", "خیابان", "بلوار", "کوچه"]:
            first_part = first_part.replace(word, "").strip()
        if first_part and first_part != city_name:
            return first_part
    
    return city_name or "نامشخص"

async def authenticate_user(session_token: Optional[str] = Cookie(None), authorization: Optional[str] = Header(None)) -> Optional[dict]:
    """بررسی احراز هویت کاربر"""
    token = session_token
    if not token and authorization:
        token = authorization.replace("Bearer ", "")
    
    if not token:
        return None
    
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """SELECT s.user_id, u.username, u.full_name
                   FROM user_sessions s
                   JOIN users u ON s.user_id = u.id
                   WHERE s.session_token = %s AND s.expires_at > CURRENT_TIMESTAMP""",
                (token,)
            )
            result = cur.fetchone()
            if result:
                return {
                    "userId": result["user_id"],
                    "username": result["username"],
                    "fullName": result["full_name"],
                }
    except Exception as e:
        print(f"Error authenticating user: {e}")
    finally:
        conn.close()
    
    return None

def require_auth(user: Optional[dict] = Depends(authenticate_user)):
    """Dependency برای routes که نیاز به احراز هویت دارند"""
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user

# ==================== Database Initialization ====================

def init_database():
    """ایجاد جداول در دیتابیس"""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # جدول کاربران
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(100) UNIQUE NOT NULL,
                    email VARCHAR(255) UNIQUE,
                    password_hash VARCHAR(255) NOT NULL,
                    full_name VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_login TIMESTAMP
                )
            """)
            
            cur.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")
            
            # جدول sessions
            cur.execute("""
                CREATE TABLE IF NOT EXISTS user_sessions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    session_token VARCHAR(255) UNIQUE NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)
            
            cur.execute("CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(session_token)")
            
            # جدول comments
            cur.execute("""
                CREATE TABLE IF NOT EXISTS store_user_comments (
                    id SERIAL PRIMARY KEY,
                    store_id INTEGER NOT NULL,
                    user_id INTEGER,
                    user_latitude FLOAT,
                    user_longitude FLOAT,
                    comment TEXT NOT NULL,
                    rating INTEGER CHECK (rating >= 1 AND rating <= 10),
                    image_urls TEXT[],
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (store_id) REFERENCES city_categories(id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
                )
            """)
            
            # اضافه کردن فیلد image_urls اگر وجود نداشته باشد
            cur.execute("""
                DO $$ 
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'store_user_comments' AND column_name = 'image_urls'
                    ) THEN
                        ALTER TABLE store_user_comments ADD COLUMN image_urls TEXT[];
                    END IF;
                END $$;
            """)
            
            cur.execute("CREATE INDEX IF NOT EXISTS idx_comments_store_id ON store_user_comments(store_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_comments_user_id ON store_user_comments(user_id)")
            
            # جدول groups
            cur.execute("""
                CREATE TABLE IF NOT EXISTS store_groups (
                    id SERIAL PRIMARY KEY,
                    group_code VARCHAR(50) UNIQUE NOT NULL,
                    group_name VARCHAR(500),
                    created_by INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
                )
            """)
            
            # جدول group members
            cur.execute("""
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
                )
            """)
            
            cur.execute("CREATE INDEX IF NOT EXISTS idx_group_members_group_code ON store_group_members(group_code)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_group_members_store_id ON store_group_members(store_id)")
            
            # جدول اختصاص مغازه‌ها به کاربران (Market Visit) - استفاده از store_token
            cur.execute("""
                CREATE TABLE IF NOT EXISTS assigned_stores (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    store_token VARCHAR(255) NOT NULL,
                    assigned_date DATE NOT NULL,
                    visit_date DATE,
                    status VARCHAR(50) DEFAULT 'pending',
                    notes TEXT,
                    assigned_by INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
                    UNIQUE(user_id, store_token, assigned_date)
                )
            """)
            
            cur.execute("CREATE INDEX IF NOT EXISTS idx_assigned_stores_user_id ON assigned_stores(user_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_assigned_stores_store_token ON assigned_stores(store_token)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_assigned_stores_assigned_date ON assigned_stores(assigned_date)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_assigned_stores_status ON assigned_stores(status)")
            
            # جدول اطلاعات و عکس‌های مارکت ویزیت - استفاده از store_token
            cur.execute("""
                CREATE TABLE IF NOT EXISTS store_visit_data (
                    id SERIAL PRIMARY KEY,
                    assignment_id INTEGER NOT NULL,
                    store_token VARCHAR(255) NOT NULL,
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
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)
            
            cur.execute("CREATE INDEX IF NOT EXISTS idx_visit_data_assignment_id ON store_visit_data(assignment_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_visit_data_store_token ON store_visit_data(store_token)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_visit_data_user_id ON store_visit_data(user_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_visit_data_visit_date ON store_visit_data(visit_date)")
            
            # اضافه کردن فیلدهای جدید به city_categories اگر وجود نداشته باشند
            cur.execute("""
                DO $$ 
                BEGIN
                    -- اضافه کردن فیلد پلاک
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'city_categories' 
                        AND column_name = 'place_plate_number'
                        AND table_schema = 'public'
                    ) THEN
                        ALTER TABLE city_categories ADD COLUMN place_plate_number VARCHAR(50);
                    END IF;
                    
                    -- اضافه کردن فیلد کد پستی
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'city_categories' 
                        AND column_name = 'place_postal_code'
                        AND table_schema = 'public'
                    ) THEN
                        ALTER TABLE city_categories ADD COLUMN place_postal_code VARCHAR(20);
                    END IF;
                    
                    -- اضافه کردن فیلد وضعیت (فعال/غیرفعال)
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'city_categories' 
                        AND column_name = 'is_active'
                        AND table_schema = 'public'
                    ) THEN
                        ALTER TABLE city_categories ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
                        UPDATE city_categories SET is_active = TRUE WHERE is_active IS NULL;
                        CREATE INDEX IF NOT EXISTS idx_city_categories_is_active ON city_categories(is_active);
                    END IF;
                    
                    -- اضافه کردن فیلد عکس‌ها
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'city_categories' 
                        AND column_name = 'place_images'
                        AND table_schema = 'public'
                    ) THEN
                        ALTER TABLE city_categories ADD COLUMN place_images TEXT[];
                    END IF;
                    
                    -- اضافه کردن فیلد کاربر ثبت‌کننده
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'city_categories' 
                        AND column_name = 'created_by_user_id'
                        AND table_schema = 'public'
                    ) THEN
                        ALTER TABLE city_categories ADD COLUMN created_by_user_id INTEGER;
                    END IF;
                    
                    -- اضافه کردن constraint برای created_by_user_id اگر وجود نداشته باشد
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.table_constraints 
                        WHERE table_name = 'city_categories' 
                        AND constraint_name = 'fk_city_categories_created_by'
                        AND table_schema = 'public'
                    ) THEN
                        ALTER TABLE city_categories ADD CONSTRAINT fk_city_categories_created_by 
                            FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
                    END IF;
                    
                    -- اضافه کردن فیلد کارگاه دارد/ندارد
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'city_categories' 
                        AND column_name = 'has_workshop'
                        AND table_schema = 'public'
                    ) THEN
                        ALTER TABLE city_categories ADD COLUMN has_workshop BOOLEAN DEFAULT FALSE;
                        UPDATE city_categories SET has_workshop = FALSE WHERE has_workshop IS NULL;
                        CREATE INDEX IF NOT EXISTS idx_city_categories_has_workshop ON city_categories(has_workshop);
                    END IF;
                    
                    -- اضافه کردن فیلد place_full_data برای ذخیره داده‌های کامل از API
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'city_categories' 
                        AND column_name = 'place_full_data'
                        AND table_schema = 'public'
                    ) THEN
                        ALTER TABLE city_categories ADD COLUMN place_full_data JSONB;
                    END IF;
                END $$;
            """)
            
            # جدول درخواست‌های غیرفعال کردن مغازه‌ها
            cur.execute("""
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
                )
            """)
            
            cur.execute("CREATE INDEX IF NOT EXISTS idx_deactivation_requests_store_id ON store_deactivation_requests(store_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_deactivation_requests_store_token ON store_deactivation_requests(store_token)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_deactivation_requests_status ON store_deactivation_requests(status)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_deactivation_requests_requested_by ON store_deactivation_requests(requested_by)")
            
            # جداول دسته‌بندی مشتریان
            cur.execute("""
                CREATE TABLE IF NOT EXISTS store_main_categories (
                    id SERIAL PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    slug VARCHAR(255) UNIQUE NOT NULL,
                    preview_count INTEGER DEFAULT 0,
                    display_order INTEGER DEFAULT 0,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            cur.execute("CREATE INDEX IF NOT EXISTS idx_main_categories_slug ON store_main_categories(slug)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_main_categories_display_order ON store_main_categories(display_order)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_main_categories_is_active ON store_main_categories(is_active)")
            
            cur.execute("""
                CREATE TABLE IF NOT EXISTS store_sub_categories (
                    id SERIAL PRIMARY KEY,
                    main_category_id INTEGER NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    slug VARCHAR(255) NOT NULL,
                    icon VARCHAR(255),
                    display_order INTEGER DEFAULT 0,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (main_category_id) REFERENCES store_main_categories(id) ON DELETE CASCADE,
                    UNIQUE(main_category_id, slug)
                )
            """)
            
            cur.execute("CREATE INDEX IF NOT EXISTS idx_sub_categories_main_category_id ON store_sub_categories(main_category_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_sub_categories_slug ON store_sub_categories(slug)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_sub_categories_display_order ON store_sub_categories(display_order)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_sub_categories_is_active ON store_sub_categories(is_active)")
            
        conn.commit()
    except Exception as e:
        error_msg = f"Error initializing database: {e}"
        print(f"[ERROR] DatabaseError: {error_msg} - Endpoint: init_database")
        import traceback
        print(traceback.format_exc())
        conn.rollback()
    finally:
        conn.close()

# اجرای initialization در startup
@app.on_event("startup")
async def startup_event():
    init_database()

# ==================== Auth Endpoints ====================

@app.post("/api/auth/register")
async def register(request: RegisterRequest, http_request: Request):
    """ثبت‌نام کاربر جدید"""
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # بررسی وجود کاربر
            cur.execute("SELECT id FROM users WHERE username = %s", (request.username,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Username already exists")
            
            # Hash کردن پسورد
            password_hash = hash_password(request.password)
            
            # ایجاد کاربر
            cur.execute(
                """INSERT INTO users (username, email, password_hash, full_name, created_at, updated_at)
                   VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                   RETURNING id, username, email, full_name, created_at""",
                (request.username, request.email, password_hash, request.fullName)
            )
            user = cur.fetchone()
            
            # ایجاد session
            session_token = generate_session_token()
            expires_at = datetime.now() + timedelta(days=30)
            
            cur.execute(
                """INSERT INTO user_sessions (user_id, session_token, expires_at, created_at)
                   VALUES (%s, %s, %s, CURRENT_TIMESTAMP)""",
                (user["id"], session_token, expires_at)
            )
            
            conn.commit()
            
            # تشخیص خودکار HTTPS از request
            url = str(http_request.url)
            is_https = url.startswith('https://')
            # یا از environment variable
            is_production = os.getenv("ENVIRONMENT") == "production" or os.getenv("HTTPS") == "true"
            is_secure = is_https or is_production
            
            response = JSONResponse({
                "success": True,
                "message": "User registered successfully",
                "user": {
                    "id": user["id"],
                    "username": user["username"],
                    "email": user["email"],
                    "fullName": user["full_name"],
                },
                "sessionToken": session_token,
            })
            response.set_cookie(
                key="session_token",
                value=session_token,
                httponly=True,
                max_age=30 * 24 * 60 * 60,
                samesite="none" if is_secure else "lax",
                secure=is_secure,
                path="/",
                domain=None  # اجازه می‌دهد cookie در همه subdomain ها کار کند
            )
            return response
            
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.put("/api/auth/login")
async def login(request: LoginRequest, http_request: Request):
    """ورود کاربر"""
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            password_hash = hash_password(request.password)
            
            # بررسی کاربر
            cur.execute(
                """SELECT id, username, email, full_name FROM users 
                   WHERE username = %s AND password_hash = %s""",
                (request.username, password_hash)
            )
            user = cur.fetchone()
            
            if not user:
                raise HTTPException(status_code=401, detail="Invalid username or password")
            
            # به‌روزرسانی last_login
            cur.execute(
                "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = %s",
                (user["id"],)
            )
            
            # ایجاد session جدید
            session_token = generate_session_token()
            expires_at = datetime.now() + timedelta(days=30)
            
            cur.execute(
                """INSERT INTO user_sessions (user_id, session_token, expires_at, created_at)
                   VALUES (%s, %s, %s, CURRENT_TIMESTAMP)""",
                (user["id"], session_token, expires_at)
            )
            
            conn.commit()
            
            # تشخیص خودکار HTTPS از request
            url = str(http_request.url)
            is_https = url.startswith('https://')
            # یا از environment variable
            is_production = os.getenv("ENVIRONMENT") == "production" or os.getenv("HTTPS") == "true"
            is_secure = is_https or is_production
            
            response = JSONResponse({
                "success": True,
                "message": "Login successful",
                "user": {
                    "id": user["id"],
                    "username": user["username"],
                    "email": user["email"],
                    "fullName": user["full_name"],
                },
                "sessionToken": session_token,
            })
            response.set_cookie(
                key="session_token",
                value=session_token,
                httponly=True,
                max_age=30 * 24 * 60 * 60,
                samesite="none" if is_secure else "lax",
                secure=is_secure,
                path="/",
                domain=None  # اجازه می‌دهد cookie در همه subdomain ها کار کند
            )
            return response
            
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/auth/logout")
async def logout(http_request: Request, user: dict = Depends(authenticate_user)):
    """خروج کاربر"""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # حذف session (اگر user موجود باشد)
            if user:
                cur.execute(
                    "DELETE FROM user_sessions WHERE user_id = %s",
                    (user["userId"],)
                )
            conn.commit()
    except Exception as e:
        conn.rollback()
    finally:
        conn.close()
    
    # تشخیص خودکار HTTPS از request
    url = str(http_request.url)
    is_https = url.startswith('https://')
    is_production = os.getenv("ENVIRONMENT") == "production" or os.getenv("HTTPS") == "true"
    is_secure = is_https or is_production
    
    response = JSONResponse({"success": True, "message": "Logout successful"})
    response.set_cookie(
        key="session_token",
        value="",
        httponly=True,
        max_age=0,
        samesite="none" if is_secure else "lax",
        secure=is_secure,
        path="/",
        domain=None
    )
    return response

@app.post("/api/update-user-location")
async def update_user_location(lat: float, lng: float, user: dict = Depends(require_auth)):
    """به‌روزرسانی لوکیشن کاربر"""
    # این endpoint فقط لوکیشن را در session یا cookie ذخیره می‌کند
    # در production می‌توانید در جدول users ذخیره کنید
    return {
        "success": True,
        "message": "Location updated",
        "location": {"lat": lat, "lng": lng}
    }

@app.get("/api/auth/me")
async def get_current_user(user: dict = Depends(require_auth)):
    """دریافت اطلاعات کاربر فعلی"""
    return {
        "success": True,
        "user": {
            "id": user["userId"],
            "username": user["username"],
            "fullName": user["fullName"],
        },
    }

# ==================== Nearby Stores Endpoint ====================

@app.get("/api/nearby-stores")
async def get_nearby_stores(
    lat: float,
    lng: float,
    maxDistance: int = 200,
    category: Optional[str] = None,
    city: Optional[str] = None,
    neighborhood: Optional[str] = None,
):
    """دریافت مغازه‌های نزدیک"""
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # ساخت کوئری
            query = """
                SELECT 
                    cc.id,
                    cc.place_name,
                    cc.place_address,
                    cc.place_coordinates_lat,
                    cc.place_coordinates_lng,
                    cc.category_display,
                    cc.category_slug,
                    cc.city_name,
                    cc.place_phone,
                    cc.place_rating,
                    cc.place_token,
                    cc.place_seo_details,
                    cc.province_name,
                    cc.has_workshop,
                    (SELECT sgm.group_code 
                     FROM store_group_members sgm 
                     WHERE sgm.store_id = cc.id 
                     ORDER BY sgm.is_primary DESC, sgm.created_at ASC 
                     LIMIT 1) as group_code
                FROM city_categories cc
                WHERE cc.place_name IS NOT NULL 
                AND cc.place_name != ''
                AND cc.place_coordinates_lat IS NOT NULL
                AND cc.place_coordinates_lng IS NOT NULL
                AND (COALESCE(cc.is_active, TRUE) = TRUE)
            """
            
            params = []
            
            if category:
                query += " AND (category_display = %s OR category_slug = %s)"
                params.extend([category, category])
            
            if city:
                query += " AND city_name = %s"
                params.append(city)
            
            if neighborhood:
                query += " AND (place_address LIKE %s OR place_seo_details::text LIKE %s)"
                params.extend([f"%{neighborhood}%", f"%{neighborhood}%"])
            
            # استفاده از bounding box برای بهبود عملکرد
            # محاسبه محدوده تقریبی (حدود 1 درجه = 111 کیلومتر)
            lat_range = maxDistance / 111000  # تبدیل متر به درجه
            lng_range = maxDistance / (111000 * abs(math.cos(math.radians(lat))))
            
            query += f"""
                AND cc.place_coordinates_lat BETWEEN %s AND %s
                AND cc.place_coordinates_lng BETWEEN %s AND %s
            """
            params.extend([
                lat - lat_range,
                lat + lat_range,
                lng - lng_range,
                lng + lng_range
            ])
            
            query += " ORDER BY cc.place_coordinates_lat, cc.place_coordinates_lng, cc.id"
            
            cur.execute(query, params)
            rows = cur.fetchall()
            
            # حذف تکراری‌ها بر اساس مختصات
            seen_coords = set()
            unique_rows = []
            for row in rows:
                coord_key = (row["place_coordinates_lat"], row["place_coordinates_lng"], row["place_name"])
                if coord_key not in seen_coords:
                    seen_coords.add(coord_key)
                    unique_rows.append(row)
            
            rows = unique_rows
            
            # فیلتر بر اساس فاصله دقیق
            nearby_stores = []
            for row in rows:
                if row["place_coordinates_lat"] and row["place_coordinates_lng"]:
                    distance = calculate_distance(
                        lat, lng,
                        row["place_coordinates_lat"],
                        row["place_coordinates_lng"]
                    )
                    
                    if distance <= maxDistance:
                        seo_details = row["place_seo_details"]
                        if isinstance(seo_details, str):
                            try:
                                seo_details = json.loads(seo_details)
                            except:
                                seo_details = None
                        
                        neighborhood_name = extract_neighborhood(
                            row["place_address"] or "",
                            row["city_name"] or "",
                            seo_details
                        )
                        
                        nearby_stores.append({
                            "id": row["id"],
                            "name": row["place_name"],
                            "address": row["place_address"],
                            "lat": row["place_coordinates_lat"],
                            "lng": row["place_coordinates_lng"],
                            "category": row["category_display"] or row["category_slug"] or "نامشخص",
                            "categorySlug": row["category_slug"] or "",
                            "city": row["city_name"],
                            "province": row["province_name"] or "",
                            "phone": row["place_phone"] or "",
                            "rating": row["place_rating"],
                            "token": row["place_token"] or "",
                            "neighborhood": neighborhood_name,
                            "distance": round(distance * 10) / 10,
                            "groupCode": row["group_code"],
                            "has_workshop": row.get("has_workshop", False),
                        })
            
            # مرتب‌سازی بر اساس فاصله
            nearby_stores.sort(key=lambda x: x["distance"])
            
            return {
                "success": True,
                "stores": nearby_stores,
                "count": len(nearby_stores),
                "userLocation": {"lat": lat, "lng": lng},
                "maxDistance": maxDistance,
                "debug": {
                    "totalRows": len(rows),
                    "latRange": [lat - lat_range, lat + lat_range],
                    "lngRange": [lng - lng_range, lng + lng_range],
                }
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/get-address")
async def get_address(lat: float, lng: float):
    """دریافت آدرس کامل از مختصات جغرافیایی با استفاده از API جدید raah.ir"""
    try:
        # استفاده از API جدید که formatted_address و components برمی‌گرداند
        url = f"https://reverse-geocoding.raah.ir/v1/?location={lng},{lat}"
        
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            # دریافت formatted_address
            formatted_address = data.get("formatted_address")
            
            # استخراج components
            components = data.get("components", [])
            city = None
            neighborhood = None
            street = None
            county = None
            
            for component in components:
                comp_type = component.get("type")
                full_name = component.get("full_name")
                
                if comp_type == "city":
                    city = full_name
                elif comp_type == "neighborhood":
                    neighborhood = full_name
                elif comp_type == "street":
                    street = full_name
                elif comp_type == "county":
                    county = full_name
            
            # اگر formatted_address موجود بود، از آن استفاده کن
            if formatted_address:
                return {
                    "success": True,
                    "address": formatted_address.strip(),
                    "formattedAddress": formatted_address.strip(),
                    "components": {
                        "city": city,
                        "neighborhood": neighborhood,
                        "street": street,
                        "county": county
                    },
                    "location": {"lat": lat, "lng": lng}
                }
            
            # اگر formatted_address نبود، از components بساز
            address_parts = []
            if street:
                address_parts.append(street)
            if neighborhood:
                address_parts.append(neighborhood)
            if county:
                address_parts.append(county)
            if city:
                address_parts.append(city)
            
            address = "، ".join(address_parts) if address_parts else None
            
            if address:
                return {
                    "success": True,
                    "address": address.strip(),
                    "formattedAddress": address.strip(),
                    "components": {
                        "city": city,
                        "neighborhood": neighborhood,
                        "street": street,
                        "county": county
                    },
                    "location": {"lat": lat, "lng": lng}
                }
            else:
                return {
                    "success": False,
                    "address": None,
                    "message": "آدرس یافت نشد"
                }
                
        except requests.exceptions.RequestException as e:
            # Fallback به روش قدیمی در صورت خطا
            address_parts = []
            
            # دریافت اطلاعات مختلف از API raah.ir و ساخت آدرس کامل
            # 1. دریافت street (خیابان)
            try:
                street_url = f"https://reverse-geocoding.raah.ir/v1/features?result_type=street&location={lng},{lat}"
                street_response = requests.get(street_url, timeout=5)
                if street_response.ok:
                    street_data = street_response.json()
                    if "features" in street_data and isinstance(street_data["features"], list) and len(street_data["features"]) > 0:
                        street_feature = street_data["features"][0]
                        street_name = None
                        if isinstance(street_feature, dict):
                            if "properties" in street_feature and isinstance(street_feature["properties"], dict):
                                street_name = street_feature["properties"].get("name")
                            elif "name" in street_feature:
                                street_name = street_feature.get("name")
                        if street_name:
                            address_parts.append(street_name)
            except:
                pass
            
            # 2. دریافت neighborhood (محله)
            try:
                neighborhood_url = f"https://reverse-geocoding.raah.ir/v1/features?result_type=neighborhood&location={lng},{lat}"
                neighborhood_response = requests.get(neighborhood_url, timeout=5)
                if neighborhood_response.ok:
                    neighborhood_data = neighborhood_response.json()
                    if "features" in neighborhood_data and isinstance(neighborhood_data["features"], list) and len(neighborhood_data["features"]) > 0:
                        neighborhood_feature = neighborhood_data["features"][0]
                        neighborhood_name = None
                        if isinstance(neighborhood_feature, dict):
                            if "properties" in neighborhood_feature and isinstance(neighborhood_feature["properties"], dict):
                                neighborhood_name = neighborhood_feature["properties"].get("name")
                            elif "name" in neighborhood_feature:
                                neighborhood_name = neighborhood_feature.get("name")
                        if neighborhood_name and neighborhood_name not in address_parts:
                            address_parts.append(neighborhood_name)
            except:
                pass
            
            # 3. دریافت city (شهر)
            try:
                city_url = f"https://reverse-geocoding.raah.ir/v1/features?result_type=city&location={lng},{lat}"
                city_response = requests.get(city_url, timeout=5)
                if city_response.ok:
                    city_data = city_response.json()
                    city_name = None
                    if "features" in city_data and isinstance(city_data["features"], list) and len(city_data["features"]) > 0:
                        city_feature = city_data["features"][0]
                        if isinstance(city_feature, dict):
                            if "properties" in city_feature and isinstance(city_feature["properties"], dict):
                                city_name = city_feature["properties"].get("name")
                            elif "name" in city_feature:
                                city_name = city_feature.get("name")
                    elif "name" in city_data:
                        city_name = city_data.get("name")
                    if city_name and city_name not in address_parts:
                        address_parts.append(city_name)
            except:
                pass
            
            # ساخت آدرس نهایی
            address = "، ".join(address_parts) if address_parts else None
            
            if address:
                return {
                    "success": True,
                    "address": address.strip(),
                    "formattedAddress": address.strip(),
                    "location": {"lat": lat, "lng": lng}
                }
            else:
                return {
                    "success": False,
                    "address": None,
                    "message": "آدرس یافت نشد"
                }
    except Exception as e:
        return {
            "success": False,
            "address": None,
            "error": str(e)
        }

@app.get("/api/store-categories")
async def get_store_categories():
    """دریافت لیست دسته‌بندی‌های مشتریان"""
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # بررسی وجود جداول
            cur.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'store_main_categories'
                ) as table_exists;
            """)
            result = cur.fetchone()
            table_exists = result["table_exists"] if result else False
            
            if not table_exists:
                return {
                    "success": False,
                    "error": "جداول دسته‌بندی ایجاد نشده‌اند. لطفاً ابتدا جداول را ایجاد کنید.",
                    "results": [],
                    "count": 0
                }
            
            # دریافت دسته‌های اصلی
            cur.execute("""
                SELECT id, title, slug, preview_count, display_order
                FROM store_main_categories
                WHERE is_active = TRUE
                ORDER BY display_order ASC, title ASC
            """)
            main_categories = cur.fetchall()
            
            if not main_categories:
                return {
                    "success": True,
                    "message": "هیچ دسته‌بندی ثبت نشده است. لطفاً ابتدا دسته‌بندی‌ها را import کنید.",
                    "results": [],
                    "count": 0
                }
            
            # دریافت زیردسته‌ها برای هر دسته اصلی
            categories_result = []
            for main_cat in main_categories:
                cur.execute("""
                    SELECT id, name, slug, icon, display_order
                    FROM store_sub_categories
                    WHERE main_category_id = %s AND is_active = TRUE
                    ORDER BY display_order ASC, name ASC
                """, (main_cat["id"],))
                sub_categories = cur.fetchall()
                
                categories_result.append({
                    "id": main_cat["id"],
                    "title": main_cat["title"],
                    "slug": main_cat["slug"],
                    "preview_count": main_cat["preview_count"],
                    "categories": [
                        {
                            "id": sub["id"],
                            "name": sub["name"],
                            "slug": sub["slug"],
                            "icon": sub["icon"] or ""
                        }
                        for sub in sub_categories
                    ]
                })
            
            return {
                "success": True,
                "results": categories_result,
                "count": len(categories_result)
            }
    except Exception as e:
        import traceback
        error_detail = f"{str(e)}\n{traceback.format_exc()}"
        print(f"[ERROR] DatabaseError: Error in get_store_categories - Endpoint: /api/store-categories")
        print(error_detail)
        return {
            "success": False,
            "error": str(e),
            "results": [],
            "count": 0
        }
    finally:
        conn.close()

@app.get("/api/get-neighborhood")
async def get_neighborhood(lat: float, lng: float):
    """دریافت نام محله از مختصات جغرافیایی"""
    try:
        neighborhood_name = None
        
        # دریافت محله از API raah.ir
        try:
            url = f"https://reverse-geocoding.raah.ir/v1/features?result_type=neighborhood&location={lng},{lat}"
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            # بررسی ساختارهای مختلف پاسخ
            if "features" in data and isinstance(data["features"], list) and len(data["features"]) > 0:
                feature = data["features"][0]
                if isinstance(feature, dict):
                    # بررسی properties.name
                    if "properties" in feature and isinstance(feature["properties"], dict):
                        neighborhood_name = feature["properties"].get("name")
                        # اگر name پیدا نشد، بررسی سایر فیلدها
                        if not neighborhood_name:
                            neighborhood_name = feature["properties"].get("neighborhood") or \
                                               feature["properties"].get("title") or \
                                               feature["properties"].get("label")
                    # بررسی مستقیم name
                    if not neighborhood_name and "name" in feature:
                        neighborhood_name = feature.get("name")
            
            # بررسی root level name
            if not neighborhood_name and "name" in data:
                neighborhood_name = data.get("name")
            
            # بررسی properties در root
            if not neighborhood_name and "properties" in data and isinstance(data["properties"], dict):
                neighborhood_name = data["properties"].get("name")
                
        except requests.exceptions.RequestException as e:
            # در صورت خطا در دریافت محله، ادامه می‌دهیم تا city را امتحان کنیم
            pass
        
        # اگر محله پیدا نشد، city را برگردان
        if not neighborhood_name:
            try:
                city_url = f"https://reverse-geocoding.raah.ir/v1/features?result_type=city&location={lng},{lat}"
                city_response = requests.get(city_url, timeout=10)
                if city_response.ok:
                    city_data = city_response.json()
                    # بررسی ساختارهای مختلف
                    if "features" in city_data and isinstance(city_data["features"], list) and len(city_data["features"]) > 0:
                        city_feature = city_data["features"][0]
                        if isinstance(city_feature, dict):
                            if "properties" in city_feature and isinstance(city_feature["properties"], dict):
                                neighborhood_name = city_feature["properties"].get("name")
                            elif "name" in city_feature:
                                neighborhood_name = city_feature.get("name")
                    if not neighborhood_name and "name" in city_data:
                        neighborhood_name = city_data.get("name")
            except:
                pass
        
        if neighborhood_name and neighborhood_name.strip():
            return {
                "success": True,
                "neighborhood": neighborhood_name.strip(),
                "location": {"lat": lat, "lng": lng}
            }
        else:
            return {
                "success": False,
                "neighborhood": None,
                "message": "محله یافت نشد"
            }
    except Exception as e:
        return {
            "success": False,
            "neighborhood": None,
            "error": str(e)
        }

@app.get("/api/stores-by-neighborhood")
async def get_stores_by_neighborhood(
    neighborhood: str,
    city: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    limit: int = 30
):
    """دریافت مشتریان یک محله (حداکثر 30 تا از نزدیک‌ترین‌ها)"""
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # ابتدا تعداد کل مغازه‌های محله را می‌شماریم
            count_query = """
                SELECT COUNT(*) as total_count
                FROM city_categories cc
                WHERE cc.place_name IS NOT NULL 
                AND cc.place_name != ''
                AND cc.place_coordinates_lat IS NOT NULL
                AND cc.place_coordinates_lng IS NOT NULL
                AND (COALESCE(cc.is_active, TRUE) = TRUE)
                AND (cc.place_address LIKE %s OR cc.place_seo_details::text LIKE %s)
            """
            
            count_params = [f"%{neighborhood}%", f"%{neighborhood}%"]
            
            if city:
                count_query += " AND cc.city_name = %s"
                count_params.append(city)
            
            cur.execute(count_query, count_params)
            total_count_result = cur.fetchone()
            total_count = total_count_result["total_count"] if total_count_result else 0
            
            # حالا مغازه‌ها را می‌گیریم
            query = """
                SELECT 
                    cc.id,
                    cc.place_name,
                    cc.place_address,
                    cc.place_coordinates_lat,
                    cc.place_coordinates_lng,
                    cc.category_display,
                    cc.category_slug,
                    cc.city_name,
                    cc.place_phone,
                    cc.place_rating,
                    cc.place_token,
                    cc.place_seo_details,
                    cc.province_name,
                    cc.has_workshop,
                    (SELECT sgm.group_code 
                     FROM store_group_members sgm 
                     WHERE sgm.store_id = cc.id 
                     ORDER BY sgm.is_primary DESC, sgm.created_at ASC 
                     LIMIT 1) as group_code
            """
            
            # اگر موقعیت کاربر داده شده، فاصله را محاسبه می‌کنیم
            if lat is not None and lng is not None:
                query += """,
                    (
                        6371 * acos(
                            cos(radians(%s)) * 
                            cos(radians(cc.place_coordinates_lat)) * 
                            cos(radians(cc.place_coordinates_lng) - radians(%s)) + 
                            sin(radians(%s)) * 
                            sin(radians(cc.place_coordinates_lat))
                        )
                    ) * 1000 as distance
                """
            
            query += """
                FROM city_categories cc
                WHERE cc.place_name IS NOT NULL 
                AND cc.place_name != ''
                AND cc.place_coordinates_lat IS NOT NULL
                AND cc.place_coordinates_lng IS NOT NULL
                AND (COALESCE(cc.is_active, TRUE) = TRUE)
                AND (cc.place_address LIKE %s OR cc.place_seo_details::text LIKE %s)
            """
            
            params = []
            if lat is not None and lng is not None:
                params.extend([lat, lng, lat])
            params.extend([f"%{neighborhood}%", f"%{neighborhood}%"])
            
            if city:
                query += " AND cc.city_name = %s"
                params.append(city)
            
            # مرتب‌سازی: اگر موقعیت داده شده، بر اساس فاصله، وگرنه بر اساس نام
            if lat is not None and lng is not None:
                query += " ORDER BY distance ASC LIMIT %s"
            else:
                query += " ORDER BY cc.place_name LIMIT %s"
            params.append(limit)
            
            cur.execute(query, params)
            rows = cur.fetchall()
            
            stores = []
            for row in rows:
                store_data = {
                    "id": row["id"],
                    "name": row["place_name"],
                    "address": row["place_address"],
                    "lat": row["place_coordinates_lat"],
                    "lng": row["place_coordinates_lng"],
                    "category": row["category_display"] or row["category_slug"] or "نامشخص",
                    "categorySlug": row["category_slug"] or "",
                    "city": row["city_name"],
                    "province": row["province_name"] or "",
                    "phone": row["place_phone"] or "",
                    "rating": row["place_rating"],
                    "token": row["place_token"] or "",
                    "has_workshop": row.get("has_workshop", False),
                }
                # اگر فاصله محاسبه شده، اضافه می‌کنیم
                if "distance" in row and row["distance"] is not None:
                    store_data["distance"] = round(row["distance"], 2)
                stores.append(store_data)
            
            return {
                "success": True,
                "stores": stores,
                "count": len(stores),
                "totalCount": total_count,
                "neighborhood": neighborhood,
                "hasMore": total_count > limit,
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ==================== Register Store Endpoint ====================

@app.post("/api/register-store")
async def register_store(request: RegisterStoreRequest, user: dict = Depends(require_auth)):
    """ثبت مغازه جدید"""
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # تولید place_token یکتا
            place_token = generate_place_token()
            
            # بررسی تکراری نبودن token
            max_attempts = 10
            attempts = 0
            while attempts < max_attempts:
                cur.execute("SELECT COUNT(*) as count FROM city_categories WHERE place_token = %s", (place_token,))
                result = cur.fetchone()
                if result and result.get('count', 0) == 0:
                    break
                place_token = generate_place_token()
                attempts += 1
            
            if attempts >= max_attempts:
                raise HTTPException(status_code=500, detail="خطا در تولید token یکتا")
            
            # استخراج city و province از آدرس یا استفاده از مقادیر ارسال شده
            city_name = request.city
            province_name = request.province
            
            # اگر city ارسال نشده، از آدرس استخراج کن یا از API استفاده کن
            if not city_name:
                try:
                    # استفاده از API get-address برای استخراج city
                    address_url = f"https://reverse-geocoding.raah.ir/v1/?location={request.lng},{request.lat}"
                    address_response = requests.get(address_url, timeout=5)
                    if address_response.ok:
                        address_data = address_response.json()
                        components = address_data.get("components", [])
                        for component in components:
                            if component.get("type") == "city" and not city_name:
                                city_name = component.get("full_name") or component.get("short_name")
                            elif component.get("type") == "county" and not province_name:
                                province_name = component.get("full_name") or component.get("short_name")
                except:
                    pass
            
            # اگر هنوز city پیدا نشد، از آدرس استخراج کن
            if not city_name and request.address:
                # سعی کن از آدرس استخراج کن (مثلاً اولین بخش بعد از کاما)
                address_parts = request.address.split("،")
                if len(address_parts) > 0:
                    # معمولاً آخرین بخش آدرس شهر است
                    city_name = address_parts[-1].strip()
            
            # اگر هنوز city پیدا نشد، از پیش‌فرض استفاده کن
            if not city_name:
                city_name = "تهران"  # مقدار پیش‌فرض
            
            # تعیین مختصات جغرافیایی
            store_lat = request.lat
            store_lng = request.lng
            
            # اگر مختصات ارسال نشده، از placeFullData استخراج کن
            if not store_lat or not store_lng:
                if request.placeFullData:
                    geometry = request.placeFullData.get("geometry", {})
                    if geometry and geometry.get("type") == "Point":
                        coordinates = geometry.get("coordinates", [])
                        if len(coordinates) >= 2:
                            try:
                                store_lng = float(coordinates[0])  # longitude first
                                store_lat = float(coordinates[1])  # latitude second
                            except (ValueError, TypeError):
                                pass
            
            # اگر هنوز مختصات موجود نیست، از forward geocoding استفاده کن
            if not store_lat or not store_lng:
                try:
                    # استفاده از API forward geocoding برای استخراج مختصات از آدرس
                    from urllib.parse import quote
                    geocode_url = f"https://geocoding.raah.ir/v1/?address={quote(request.address)}"
                    geocode_response = requests.get(geocode_url, timeout=5)
                    if geocode_response.ok:
                        geocode_data = geocode_response.json()
                        if geocode_data.get("location"):
                            location = geocode_data["location"]
                            store_lng = location.get("lng")
                            store_lat = location.get("lat")
                except:
                    pass
            
            # تبدیل placeFullData به JSON string برای ذخیره در دیتابیس
            place_full_data_json = None
            if request.placeFullData:
                try:
                    place_full_data_json = json.dumps(request.placeFullData, ensure_ascii=False)
                except:
                    place_full_data_json = None
            
            # درج مغازه جدید
            cur.execute(
                """INSERT INTO city_categories 
                   (place_name, place_address, place_coordinates_lat, place_coordinates_lng,
                    category_display, category_slug, city_name, province_name, place_phone, place_token,
                    place_plate_number, place_postal_code, is_active, place_images, created_by_user_id, page_number, place_full_data)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   RETURNING id, place_name, place_address, place_coordinates_lat, place_coordinates_lng,
                             category_display, category_slug, city_name, province_name, place_phone, place_token,
                             place_plate_number, place_postal_code, is_active, place_images, created_by_user_id""",
                (
                    request.name,
                    request.address,
                    store_lat,
                    store_lng,
                    request.category,
                    request.categorySlug or request.category.lower().replace(' ', '_'),
                    city_name,
                    province_name,
                    request.phone,
                    place_token,
                    request.plateNumber,
                    request.postalCode,
                    request.isActive if request.isActive is not None else True,
                    request.imageUrls or [],
                    user["userId"],
                    1,  # page_number - مقدار پیش‌فرض برای مغازه‌های دستی ثبت شده
                    place_full_data_json  # place_full_data
                )
            )
            
            result = cur.fetchone()
            if not result:
                conn.rollback()
                raise HTTPException(status_code=500, detail="خطا در ثبت مغازه. نتیجه ثبت نشد.")
            
            conn.commit()
            
            return {
                "success": True,
                "message": "مغازه با موفقیت ثبت شد",
                "store": {
                    "id": result["id"],
                    "name": result["place_name"],
                    "address": result["place_address"],
                    "lat": result["place_coordinates_lat"],
                    "lng": result["place_coordinates_lng"],
                    "category": result["category_display"],
                    "categorySlug": result["category_slug"],
                    "city": result["city_name"],
                    "province": result["province_name"],
                    "phone": result["place_phone"],
                    "token": result["place_token"],
                    "plateNumber": result.get("place_plate_number"),
                    "postalCode": result.get("place_postal_code"),
                    "isActive": result.get("is_active", True),
                    "imageUrls": result.get("place_images") or [],
                }
            }
            
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        import traceback
        error_detail = f"{str(e)}\n{traceback.format_exc()}"
        print(f"[ERROR] DatabaseError: Error in register-store - Endpoint: /api/register-store")
        print(error_detail)
        raise HTTPException(status_code=500, detail=f"خطا در ثبت مغازه: {str(e)}")
    finally:
        conn.close()

# ==================== Store Comments Endpoints ====================

@app.post("/api/upload-comment-image")
async def upload_comment_image(file: UploadFile = File(...), user: dict = Depends(require_auth)):
    """آپلود عکس برای نظر"""
    import os
    import uuid
    from pathlib import Path
    
    # ایجاد پوشه uploads اگر وجود نداشته باشد
    upload_dir = Path("uploads/comments")
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    # تولید نام یکتا برای فایل
    file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    unique_filename = f"{uuid.uuid4()}.{file_ext}"
    file_path = upload_dir / unique_filename
    
    try:
        # ذخیره فایل
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # URL فایل (در production باید از CDN یا storage service استفاده شود)
        file_url = f"/uploads/comments/{unique_filename}"
        
        return {
            "success": True,
            "url": file_url,
            "filename": unique_filename
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading file: {str(e)}")

@app.post("/api/store-comments")
async def create_comment(request: CommentRequest, user: dict = Depends(require_auth)):
    """ثبت نظر برای مغازه"""
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """INSERT INTO store_user_comments 
                   (store_id, user_id, comment, rating, user_latitude, user_longitude, image_urls, created_at, updated_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                   RETURNING id, created_at""",
                (request.storeId, user["userId"], request.comment, request.rating, request.userLat, request.userLng, request.imageUrls or [])
            )
            result = cur.fetchone()
            conn.commit()
            
            return {
                "success": True,
                "message": "Comment saved successfully",
                "comment": {
                    "id": result["id"],
                    "storeId": request.storeId,
                    "comment": request.comment,
                    "rating": request.rating,
                    "createdAt": to_jalali_datetime(result["created_at"]),
                },
            }
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/store-comments")
async def get_comments(storeId: int):
    """دریافت نظرات یک مغازه"""
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """SELECT c.id, c.store_id, c.user_id, c.comment, c.rating, 
                          c.user_latitude, c.user_longitude, c.image_urls, c.created_at, c.updated_at,
                          u.username, u.full_name
                   FROM store_user_comments c
                   LEFT JOIN users u ON c.user_id = u.id
                   WHERE c.store_id = %s
                   ORDER BY c.created_at DESC""",
                (storeId,)
            )
            comments = cur.fetchall()
            
            return {
                "success": True,
                "comments": [
                    {
                        "id": c["id"],
                        "store_id": c["store_id"],
                        "user_id": c["user_id"],
                        "username": c["username"],
                        "fullName": c["full_name"],
                        "comment": c["comment"],
                        "rating": c["rating"],
                        "image_urls": c.get("image_urls") or [],
                        "created_at": c["created_at"].isoformat() if c["created_at"] else None,
                    }
                    for c in comments
                ],
                "count": len(comments),
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ==================== Store Groups Endpoints ====================

def generate_group_code() -> str:
    """تولید کد یکتا برای گروه"""
    import time
    import random
    import string
    timestamp = int(time.time() * 1000)
    random_str = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"GRP-{timestamp}-{random_str}"

def generate_place_token() -> str:
    """تولید place_token یکتا برای مغازه"""
    import time
    import random
    import string
    timestamp = int(time.time() * 1000)
    random_str = ''.join(random.choices(string.ascii_lowercase + string.digits, k=12))
    return f"store_{timestamp}_{random_str}"

@app.post("/api/store-groups")
async def create_group(request: GroupRequest, user: dict = Depends(require_auth)):
    """ایجاد گروه جدید یا اضافه کردن مغازه به گروه موجود"""
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            final_group_code = request.groupCode
            
            if not final_group_code:
                final_group_code = generate_group_code()
                group_name = request.groupName or f"گروه {final_group_code}"
                
                cur.execute(
                    """INSERT INTO store_groups (group_code, group_name, created_by, created_at, updated_at)
                       VALUES (%s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                       ON CONFLICT (group_code) DO NOTHING""",
                    (final_group_code, group_name, user["userId"])
                )
            else:
                # بررسی وجود گروه
                cur.execute("SELECT group_code FROM store_groups WHERE group_code = %s", (final_group_code,))
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Group not found")
            
            # اضافه کردن مغازه‌ها به گروه
            added_stores = []
            for i, store_id in enumerate(request.storeIds):
                is_primary = i == 0
                try:
                    cur.execute(
                        """INSERT INTO store_group_members (group_code, store_id, is_primary, created_by, created_at)
                           VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
                           ON CONFLICT (group_code, store_id) DO NOTHING""",
                        (final_group_code, store_id, is_primary, user["userId"])
                    )
                    added_stores.append(store_id)
                except Exception as e:
                    print(f"Error adding store {store_id} to group: {e}")
            
            # دریافت اطلاعات گروه
            cur.execute("SELECT * FROM store_groups WHERE group_code = %s", (final_group_code,))
            group_info = cur.fetchone()
            
            # دریافت لیست مغازه‌های گروه
            cur.execute(
                """SELECT sgm.*, cc.place_name, cc.place_address, cc.city_name
                   FROM store_group_members sgm
                   JOIN city_categories cc ON sgm.store_id = cc.id
                   WHERE sgm.group_code = %s
                   ORDER BY sgm.is_primary DESC, sgm.created_at ASC""",
                (final_group_code,)
            )
            members = cur.fetchall()
            
            conn.commit()
            
            return {
                "success": True,
                "message": "Stores grouped successfully",
                "group": {
                    "code": final_group_code,
                    "name": group_info["group_name"],
                    "createdAt": to_jalali_datetime(group_info["created_at"]) if group_info["created_at"] else None,
                },
                "stores": [
                    {
                        "id": m["id"],
                        "store_id": m["store_id"],
                        "group_code": m["group_code"],
                        "is_primary": m["is_primary"],
                        "place_name": m["place_name"],
                        "place_address": m["place_address"],
                        "city_name": m["city_name"],
                    }
                    for m in members
                ],
                "addedCount": len(added_stores),
            }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/store-groups")
async def get_groups(groupCode: Optional[str] = None, storeId: Optional[int] = None):
    """دریافت اطلاعات گروه یا لیست گروه‌ها"""
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if groupCode:
                # دریافت اطلاعات یک گروه خاص
                cur.execute("SELECT * FROM store_groups WHERE group_code = %s", (groupCode,))
                group = cur.fetchone()
                
                if not group:
                    raise HTTPException(status_code=404, detail="Group not found")
                
                cur.execute(
                    """SELECT sgm.*, cc.place_name, cc.place_address, cc.city_name,
                              cc.place_coordinates_lat, cc.place_coordinates_lng
                       FROM store_group_members sgm
                       JOIN city_categories cc ON sgm.store_id = cc.id
                       WHERE sgm.group_code = %s
                       ORDER BY sgm.is_primary DESC, sgm.created_at ASC""",
                    (groupCode,)
                )
                members = cur.fetchall()
                
                return {
                    "success": True,
                    "group": dict(group),
                    "stores": [dict(m) for m in members],
                }
            elif storeId:
                # دریافت گروه‌هایی که یک مغازه در آن است
                cur.execute(
                    """SELECT sg.*, sgm.is_primary
                       FROM store_groups sg
                       JOIN store_group_members sgm ON sg.group_code = sgm.group_code
                       WHERE sgm.store_id = %s""",
                    (storeId,)
                )
                groups = cur.fetchall()
                
                return {
                    "success": True,
                    "groups": [dict(g) for g in groups],
                }
            else:
                # دریافت لیست همه گروه‌ها
                cur.execute(
                    """SELECT sg.*, COUNT(sgm.store_id) as store_count
                       FROM store_groups sg
                       LEFT JOIN store_group_members sgm ON sg.group_code = sgm.group_code
                       GROUP BY sg.id, sg.group_code, sg.group_name, sg.created_at, sg.updated_at
                       ORDER BY sg.created_at DESC"""
                )
                groups = cur.fetchall()
                
                return {
                    "success": True,
                    "groups": [dict(g) for g in groups],
                }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/store-groups")
async def delete_group(groupCode: str, storeId: Optional[int] = None):
    """حذف مغازه از گروه یا حذف کل گروه"""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            if storeId:
                # حذف یک مغازه از گروه
                cur.execute(
                    "DELETE FROM store_group_members WHERE group_code = %s AND store_id = %s",
                    (groupCode, storeId)
                )
                message = "Store removed from group"
            else:
                # حذف کل گروه
                cur.execute("DELETE FROM store_groups WHERE group_code = %s", (groupCode,))
                message = "Group deleted successfully"
            
            conn.commit()
            
            return {
                "success": True,
                "message": message,
            }
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ==================== Assigned Stores Endpoints (Market Visit) ====================

@app.post("/api/assigned-stores")
async def assign_stores(request: AssignStoreRequest, admin: dict = Depends(require_auth)):
    """اختصاص مغازه‌ها به کاربر بر اساس store_token (فقط برای ادمین)"""
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            assigned_stores = []
            for store_token in request.storeTokens:
                try:
                    # بررسی وجود token در دیتابیس
                    cur.execute("SELECT COUNT(*) as count FROM city_categories WHERE place_token = %s", (store_token,))
                    token_result = cur.fetchone()
                    if not token_result or token_result['count'] == 0:
                        print(f"Store token {store_token} not found")
                        continue
                    
                    cur.execute(
                        """INSERT INTO assigned_stores 
                           (user_id, store_token, assigned_date, notes, assigned_by, created_at, updated_at)
                           VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                           ON CONFLICT (user_id, store_token, assigned_date) DO UPDATE
                           SET notes = EXCLUDED.notes, updated_at = CURRENT_TIMESTAMP
                           RETURNING id, user_id, store_token, assigned_date, status""",
                        (request.userId, store_token, request.assignedDate, request.notes, admin["userId"])
                    )
                    result = cur.fetchone()
                    if result:
                        assigned_stores.append(dict(result))
                except Exception as e:
                    print(f"Error assigning store {store_token}: {e}")
                    continue
            
            conn.commit()
            
            return {
                "success": True,
                "message": f"{len(assigned_stores)} stores assigned successfully",
                "assignedStores": assigned_stores,
            }
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/assigned-stores")
async def get_assigned_stores(
    userId: Optional[int] = None,
    assignedDate: Optional[str] = None,
    status: Optional[str] = None,
    user: dict = Depends(require_auth)
):
    """دریافت لیست مغازه‌های اختصاص داده شده"""
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # اگر userId مشخص نشده، از کاربر فعلی استفاده کن
            target_user_id = userId if userId else user["userId"]
            
            query = """
                SELECT 
                    as_store.id,
                    as_store.user_id,
                    as_store.store_token,
                    as_store.assigned_date,
                    as_store.visit_date,
                    as_store.status,
                    as_store.notes,
                    as_store.created_at,
                    COALESCE(cc.place_name, 'نامشخص') as storeName,
                    COALESCE(cc.place_address, '') as storeAddress,
                    cc.place_coordinates_lat as storeLat,
                    cc.place_coordinates_lng as storeLng,
                    COALESCE(cc.category_display, '') as category,
                    cc.category_slug,
                    COALESCE(cc.city_name, '') as city,
                    cc.place_phone,
                    cc.place_rating,
                    cc.place_rating_count,
                    cc.place_description,
                    cc.place_website,
                    cc.place_email,
                    cc.place_price_range,
                    cc.place_full_data,
                    u.username,
                    u.full_name
                FROM assigned_stores as_store
                LEFT JOIN city_categories cc ON as_store.store_token = cc.place_token
                JOIN users u ON as_store.user_id = u.id
                WHERE as_store.user_id = %s
            """
            params = [target_user_id]
            
            if assignedDate:
                query += " AND as_store.assigned_date = %s"
                params.append(assignedDate)
            
            if status:
                query += " AND as_store.status = %s"
                params.append(status)
            
            query += " ORDER BY as_store.assigned_date DESC, COALESCE(cc.place_name, '')"
            
            cur.execute(query, params)
            rows = cur.fetchall()
            
            # Debug: Log query results
            if rows:
                print(f"DEBUG get_assigned_stores: Found {len(rows)} assigned stores")
                for i, row in enumerate(rows[:3]):  # Log first 3 rows
                    print(f"DEBUG Row {i+1}:")
                    print(f"  - store_token: {row.get('store_token')}")
                    print(f"  - storeName (alias): {row.get('storeName')}")
                    print(f"  - storeAddress (alias): {row.get('storeAddress')}")
                    print(f"  - storeLat: {row.get('storeLat')}")
                    print(f"  - storeLng: {row.get('storeLng')}")
                    # Check if JOIN worked
                    if row.get('storeName') == 'نامشخص' or row.get('storeName') is None:
                        print(f"  - WARNING: JOIN may have failed! Checking place_token match...")
                        # Check if place_token exists
                        cur.execute("SELECT place_token, place_name FROM city_categories WHERE place_token = %s LIMIT 1", (row.get('store_token'),))
                        match = cur.fetchone()
                        if match:
                            print(f"  - Found matching place_token: {match.get('place_token')}, place_name: {match.get('place_name')}")
                        else:
                            print(f"  - ERROR: No matching place_token found in city_categories!")
            else:
                print("DEBUG get_assigned_stores: No assigned stores found")
            
            # استفاده از fullData برای استخراج اطلاعات
            assigned_stores_list = []
            seen_tokens = set()  # برای جلوگیری از تکرار
            
            for row in rows:
                store_token = row.get("store_token")
                
                # جلوگیری از تکرار
                if store_token in seen_tokens:
                    continue
                seen_tokens.add(store_token)
                
                full_data = row.get("place_full_data")
                
                # اگر fullData موجود است، از آن استفاده کن
                store_name = "نامشخص"
                store_address = ""
                store_lat = None
                store_lng = None
                category = ""
                category_slug = None
                city = ""
                phone = None
                rating = None
                rating_count = None
                description = None
                website = None
                email = None
                price_range = None
                
                if full_data:
                    if isinstance(full_data, str):
                        try:
                            full_data = json.loads(full_data)
                        except:
                            full_data = None
                    
                    if full_data and isinstance(full_data, dict):
                        # استخراج name از fullData
                        store_name = full_data.get("name") or full_data.get("seo_details", {}).get("name") or "نامشخص"
                        
                        # استخراج آدرس از fields
                        fields = full_data.get("fields", [])
                        if fields:
                            address_field = next((f.get("value") for f in fields if f.get("type") == "text" and f.get("value")), None)
                            if address_field:
                                store_address = address_field
                        
                        # استخراج مختصات از geometry
                        geometry = full_data.get("geometry", {})
                        if geometry and geometry.get("type") == "Point":
                            coordinates = geometry.get("coordinates", [])
                            if len(coordinates) >= 2:
                                try:
                                    store_lng = float(coordinates[0]) if not isinstance(coordinates[0], dict) else None  # longitude first
                                    store_lat = float(coordinates[1]) if not isinstance(coordinates[1], dict) else None  # latitude second
                                except (ValueError, TypeError):
                                    store_lng = None
                                    store_lat = None
                        
                        # استخراج سایر اطلاعات
                        category = full_data.get("category") or ""
                        phone = full_data.get("phone_link")
                        rating = full_data.get("rating")
                        if rating is not None and isinstance(rating, dict):
                            rating = None
                        if full_data.get("reviews"):
                            rating_count = full_data.get("reviews", {}).get("total", 0)
                            if isinstance(rating_count, dict):
                                rating_count = None
                        description = full_data.get("description")
                        price_range = full_data.get("price_range")
                        
                        # استخراج category_slug از seo_details
                        seo_details = full_data.get("seo_details", {})
                        if seo_details:
                            url_title = seo_details.get("url_title", "")
                            # استخراج slug از url_title (مثلاً: "آجیل-و-شیرینی-سرای-آفاق-tehran-nei-iran-shahr_nuts-store")
                            if "_" in url_title:
                                category_slug = url_title.split("_")[-1]
                        
                        # استخراج city از seo_details
                        if seo_details:
                            schemas = seo_details.get("schemas", [])
                            if schemas and len(schemas) > 0:
                                geo = schemas[0].get("geo", {})
                                if geo:
                                    address_locality = geo.get("addressLocality")
                                    if address_locality:
                                        city = address_locality
                
                # اگر هنوز اطلاعات نداریم، از row استفاده کن (fallback)
                if store_name == "نامشخص":
                    store_name = row.get("storeName") or row.get("place_name") or "نامشخص"
                if not store_address:
                    store_address = row.get("storeAddress") or row.get("place_address") or ""
                if not store_lat:
                    lat_val = row.get("storeLat") or row.get("place_coordinates_lat")
                    if lat_val is not None and not isinstance(lat_val, dict):
                        try:
                            store_lat = float(lat_val)
                        except (ValueError, TypeError):
                            store_lat = None
                if not store_lng:
                    lng_val = row.get("storeLng") or row.get("place_coordinates_lng")
                    if lng_val is not None and not isinstance(lng_val, dict):
                        try:
                            store_lng = float(lng_val)
                        except (ValueError, TypeError):
                            store_lng = None
                if not category:
                    category = row.get("category") or row.get("category_display") or ""
                if not category_slug:
                    category_slug = row.get("category_slug")
                if not city:
                    city = row.get("city") or row.get("city_name") or ""
                if not phone:
                    phone = row.get("place_phone")
                if rating is None:
                    rating_val = row.get("place_rating")
                    if rating_val is not None and not isinstance(rating_val, dict):
                        try:
                            rating = float(rating_val)
                        except (ValueError, TypeError):
                            rating = None
                if rating_count is None:
                    count_val = row.get("place_rating_count")
                    if count_val is not None and not isinstance(count_val, dict):
                        try:
                            rating_count = int(count_val)
                        except (ValueError, TypeError):
                            rating_count = None
                if not description:
                    description = row.get("place_description")
                if not website:
                    website = row.get("place_website")
                if not email:
                    email = row.get("place_email")
                if not price_range:
                    price_range = row.get("place_price_range")
                
                assigned_stores_list.append({
                    "id": row["id"],
                    "userId": row["user_id"],
                    "storeToken": row["store_token"],
                    "assignedDate": to_jalali_date(row["assigned_date"]),
                    "visitDate": to_jalali_date(row["visit_date"]) if row["visit_date"] else None,
                    "status": row["status"],
                    "notes": row["notes"],
                    "storeName": store_name,
                    "storeAddress": store_address,
                    "storeLat": store_lat if isinstance(store_lat, (int, float)) else None,
                    "storeLng": store_lng if isinstance(store_lng, (int, float)) else None,
                    "category": category,
                    "categorySlug": category_slug,
                    "city": city,
                    "phone": phone,
                    "rating": rating if isinstance(rating, (int, float)) else None,
                    "ratingCount": rating_count if isinstance(rating_count, int) else None,
                    "description": description,
                    "website": website,
                    "email": email,
                    "priceRange": price_range,
                    "fullData": full_data if full_data else (json.loads(row["place_full_data"]) if row.get("place_full_data") and isinstance(row.get("place_full_data"), str) else (row.get("place_full_data") if row.get("place_full_data") else None)),
                    "username": row["username"],
                    "fullName": row["full_name"],
                    "createdAt": to_jalali_datetime(row["created_at"]) if row["created_at"] else None,
                })
            
            return {
                "success": True,
                "assignedStores": assigned_stores_list,
                "count": len(assigned_stores_list),
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/api/store-visit-data")
async def submit_visit_data(request: VisitDataRequest, user: dict = Depends(require_auth)):
    """ثبت اطلاعات و عکس‌های مارکت ویزیت"""
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # بررسی اینکه assignment متعلق به کاربر فعلی است
            cur.execute(
                "SELECT id, user_id, store_token FROM assigned_stores WHERE id = %s",
                (request.assignmentId,)
            )
            assignment = cur.fetchone()
            
            if not assignment:
                raise HTTPException(status_code=404, detail="Assignment not found")
            
            if assignment["user_id"] != user["userId"]:
                raise HTTPException(status_code=403, detail="You don't have permission to submit data for this assignment")
            
            # ثبت اطلاعات ویزیت
            cur.execute(
                """INSERT INTO store_visit_data 
                   (assignment_id, store_token, user_id, visit_date, visit_time, image_urls, additional_info, latitude, longitude, created_at, updated_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                   RETURNING id, created_at""",
                (
                    request.assignmentId,
                    assignment["store_token"],
                    user["userId"],
                    request.visitDate,
                    request.visitTime,
                    request.imageUrls or [],
                    json.dumps(request.additionalInfo) if request.additionalInfo else None,
                    request.latitude,
                    request.longitude,
                )
            )
            visit_data = cur.fetchone()
            
            # به‌روزرسانی وضعیت assignment
            cur.execute(
                """UPDATE assigned_stores 
                   SET visit_date = %s, status = 'completed', updated_at = CURRENT_TIMESTAMP
                   WHERE id = %s""",
                (request.visitDate, request.assignmentId)
            )
            
            conn.commit()
            
            return {
                "success": True,
                "message": "Visit data saved successfully",
                "visitData": {
                    "id": visit_data["id"],
                    "assignmentId": request.assignmentId,
                    "visitDate": to_jalali_date(request.visitDate),
                    "createdAt": to_jalali_datetime(visit_data["created_at"]) if visit_data["created_at"] else None,
                },
            }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/store-visit-data")
async def get_visit_data(
    assignmentId: Optional[int] = None,
    storeId: Optional[int] = None,
    storeToken: Optional[str] = None,
    userId: Optional[int] = None,
    user: dict = Depends(require_auth)
):
    """دریافت اطلاعات ویزیت‌ها"""
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = """
                SELECT 
                    svd.id,
                    svd.assignment_id,
                    svd.store_token,
                    svd.user_id,
                    svd.visit_date,
                    svd.visit_time,
                    svd.image_urls,
                    svd.additional_info,
                    svd.latitude,
                    svd.longitude,
                    svd.created_at,
                    COALESCE(cc.place_name, 'نامشخص') as storeName,
                    cc.place_address,
                    cc.city_name,
                    cc.category_display,
                    cc.category_slug,
                    u.username,
                    u.full_name
                FROM store_visit_data svd
                LEFT JOIN city_categories cc ON svd.store_token = cc.place_token
                JOIN users u ON svd.user_id = u.id
                WHERE 1=1
            """
            params = []
            
            if assignmentId:
                query += " AND svd.assignment_id = %s"
                params.append(assignmentId)
            
            if storeId:
                query += " AND svd.store_token = (SELECT place_token FROM city_categories WHERE id = %s LIMIT 1)"
                params.append(storeId)
            elif storeToken:
                query += " AND svd.store_token = %s"
                params.append(storeToken)
            
            # اگر userId مشخص نشده، فقط ویزیت‌های کاربر فعلی را نشان بده
            target_user_id = userId if userId else user["userId"]
            query += " AND svd.user_id = %s"
            params.append(target_user_id)
            
            query += " ORDER BY svd.visit_date DESC, svd.created_at DESC"
            
            cur.execute(query, params)
            rows = cur.fetchall()
            
            return {
                "success": True,
                "visitData": [
                    {
                        "id": row["id"],
                        "assignmentId": row["assignment_id"],
                        "storeToken": row["store_token"],
                        "userId": row["user_id"],
                        "visitDate": to_jalali_date(row["visit_date"]),
                        "visitTime": str(row["visit_time"]) if row["visit_time"] else None,
                        "imageUrls": row["image_urls"] or [],
                        "additionalInfo": json.loads(row["additional_info"]) if row["additional_info"] else None,
                        "latitude": row["latitude"],
                        "longitude": row["longitude"],
                        "storeName": row.get("storeName") or row.get("place_name") or "نامشخص",
                        "username": row["username"],
                        "fullName": row["full_name"],
                        "createdAt": to_jalali_datetime(row["created_at"]) if row["created_at"] else None,
                    }
                    for row in rows
                ],
                "count": len(rows),
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ==================== Store Deactivation Requests ====================

class StoreDeactivationRequest(BaseModel):
    storeId: int
    reason: Optional[str] = None

@app.post("/api/store-deactivation-request")
async def create_store_deactivation_request(
    request: StoreDeactivationRequest,
    user: dict = Depends(require_auth)
):
    """ثبت درخواست غیرفعال کردن مغازه"""
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # بررسی وجود جدول store_deactivation_requests
            cur.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'store_deactivation_requests'
                ) as table_exists;
            """)
            result = cur.fetchone()
            table_exists = result["table_exists"] if result else False
            
            if not table_exists:
                # ایجاد جدول در صورت عدم وجود
                cur.execute("""
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
                    )
                """)
                cur.execute("CREATE INDEX IF NOT EXISTS idx_deactivation_requests_store_id ON store_deactivation_requests(store_id)")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_deactivation_requests_store_token ON store_deactivation_requests(store_token)")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_deactivation_requests_status ON store_deactivation_requests(status)")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_deactivation_requests_requested_by ON store_deactivation_requests(requested_by)")
                conn.commit()
            
            # بررسی وجود مغازه
            cur.execute("SELECT id, place_token FROM city_categories WHERE id = %s", (request.storeId,))
            store = cur.fetchone()
            
            if not store:
                raise HTTPException(status_code=404, detail="مغازه یافت نشد")
            
            # بررسی درخواست تکراری pending
            cur.execute("""
                SELECT id FROM store_deactivation_requests 
                WHERE store_id = %s AND status = 'pending'
            """, (request.storeId,))
            existing = cur.fetchone()
            
            if existing:
                return {
                    "success": False,
                    "message": "درخواست غیرفعال کردن این مغازه در حال بررسی است"
                }
            
            # ثبت درخواست
            cur.execute("""
                INSERT INTO store_deactivation_requests 
                (store_id, store_token, requested_by, reason, status)
                VALUES (%s, %s, %s, %s, 'pending')
                RETURNING id
            """, (request.storeId, store.get("place_token"), user["userId"], request.reason))
            
            result = cur.fetchone()
            if not result or "id" not in result:
                raise HTTPException(status_code=500, detail="خطا در ثبت درخواست. لطفاً دوباره تلاش کنید.")
            
            request_id = result["id"]
            conn.commit()
            
            return {
                "success": True,
                "message": "درخواست غیرفعال کردن مغازه با موفقیت ثبت شد",
                "requestId": request_id
            }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        import traceback
        error_detail = f"{str(e)}\n{traceback.format_exc()}"
        print(f"[ERROR] DatabaseError: Error in store-deactivation-request - Endpoint: /api/store-deactivation-request")
        print(error_detail)
        raise HTTPException(status_code=500, detail=f"خطا در ثبت درخواست: {str(e)}")
    finally:
        conn.close()

class ReviewDeactivationRequest(BaseModel):
    requestId: int
    action: str  # 'approve' or 'reject'
    notes: Optional[str] = None

class UpdateStoreWorkshopRequest(BaseModel):
    storeId: int
    hasWorkshop: bool

@app.post("/api/review-deactivation-request")
async def review_deactivation_request(
    request: ReviewDeactivationRequest,
    user: dict = Depends(require_auth)
):
    """بررسی و تایید/رد درخواست غیرفعال کردن مغازه (فقط مدیر)"""
    # TODO: بررسی نقش مدیر - فعلاً همه کاربران می‌توانند بررسی کنند
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # دریافت درخواست
            cur.execute("""
                SELECT * FROM store_deactivation_requests 
                WHERE id = %s AND status = 'pending'
            """, (request.requestId,))
            deactivation_request = cur.fetchone()
            
            if not deactivation_request:
                raise HTTPException(status_code=404, detail="درخواست یافت نشد یا قبلاً بررسی شده است")
            
            if request.action == 'approve':
                # غیرفعال کردن مغازه
                cur.execute("""
                    UPDATE city_categories 
                    SET is_active = FALSE 
                    WHERE id = %s
                """, (deactivation_request["store_id"],))
                
                # به‌روزرسانی وضعیت درخواست
                cur.execute("""
                    UPDATE store_deactivation_requests 
                    SET status = 'approved',
                        reviewed_by = %s,
                        reviewed_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                """, (user["userId"], request.requestId))
                
                conn.commit()
                
                return {
                    "success": True,
                    "message": "مغازه با موفقیت غیرفعال شد"
                }
            elif request.action == 'reject':
                # رد درخواست
                cur.execute("""
                    UPDATE store_deactivation_requests 
                    SET status = 'rejected',
                        reviewed_by = %s,
                        reviewed_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                """, (user["userId"], request.requestId))
                
                conn.commit()
                
                return {
                    "success": True,
                    "message": "درخواست رد شد"
                }
            else:
                raise HTTPException(status_code=400, detail="عمل نامعتبر است. باید 'approve' یا 'reject' باشد")
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/deactivation-requests")
async def get_deactivation_requests(
    status: Optional[str] = None,
    user: dict = Depends(require_auth)
):
    """دریافت لیست درخواست‌های غیرفعال کردن (فقط مدیر)"""
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = """
                SELECT 
                    sdr.id,
                    sdr.store_id,
                    sdr.store_token,
                    sdr.reason,
                    sdr.status,
                    sdr.created_at,
                    sdr.reviewed_at,
                    cc.place_name,
                    cc.place_address,
                    u1.username as requested_by_username,
                    u1.full_name as requested_by_fullname,
                    u2.username as reviewed_by_username,
                    u2.full_name as reviewed_by_fullname
                FROM store_deactivation_requests sdr
                LEFT JOIN city_categories cc ON sdr.store_id = cc.id
                LEFT JOIN users u1 ON sdr.requested_by = u1.id
                LEFT JOIN users u2 ON sdr.reviewed_by = u2.id
            """
            
            params = []
            if status:
                query += " WHERE sdr.status = %s"
                params.append(status)
            
            query += " ORDER BY sdr.created_at DESC"
            
            cur.execute(query, params)
            rows = cur.fetchall()
            
            requests = []
            for row in rows:
                requests.append({
                    "id": row["id"],
                    "storeId": row["store_id"],
                    "storeToken": row["store_token"],
                    "storeName": row["place_name"],
                    "storeAddress": row["place_address"],
                    "reason": row["reason"],
                    "status": row["status"],
                    "requestedBy": {
                        "username": row["requested_by_username"],
                        "fullName": row["requested_by_fullname"]
                    },
                    "reviewedBy": row["reviewed_by_username"] and {
                        "username": row["reviewed_by_username"],
                        "fullName": row["reviewed_by_fullname"]
                    },
                    "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
                    "reviewedAt": row["reviewed_at"].isoformat() if row["reviewed_at"] else None,
                })
            
            return {
                "success": True,
                "requests": requests,
                "count": len(requests)
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ==================== Update Store Workshop Status ====================

@app.patch("/api/store-workshop")
async def update_store_workshop(
    request: UpdateStoreWorkshopRequest,
    user: dict = Depends(require_auth)
):
    """به‌روزرسانی وضعیت کارگاه مغازه"""
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # بررسی وجود مغازه
            cur.execute("SELECT id FROM city_categories WHERE id = %s", (request.storeId,))
            store = cur.fetchone()
            
            if not store:
                raise HTTPException(status_code=404, detail="مغازه یافت نشد")
            
            # به‌روزرسانی وضعیت کارگاه
            cur.execute("""
                UPDATE city_categories 
                SET has_workshop = %s, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
                RETURNING id, has_workshop
            """, (request.hasWorkshop, request.storeId))
            
            result = cur.fetchone()
            conn.commit()
            
            return {
                "success": True,
                "message": "وضعیت کارگاه با موفقیت به‌روزرسانی شد",
                "storeId": result["id"],
                "hasWorkshop": result["has_workshop"]
            }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"خطا در به‌روزرسانی وضعیت کارگاه: {str(e)}")
    finally:
        conn.close()

# ==================== Root Endpoint ====================

@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "Store Management API", "version": "1.0.0"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

