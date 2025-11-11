// API Configuration
const LOCAL_API_URL = 'http://localhost:8000';
const PRODUCTION_API_URL = 'https://survey-backend.dbaraka.shop';

// در production از proxy استفاده می‌کنیم (از vite.config.ts)
// در development از localhost استفاده می‌کنیم
// اما proxy فقط در development کار می‌کند، پس در production باید مستقیماً به backend متصل شویم
const isProduction = typeof window !== 'undefined' && 
  window.location.hostname !== 'localhost' && 
  window.location.hostname !== '127.0.0.1';

// تعیین URL بر اساس environment variable یا پیش‌فرض
// در production از production URL استفاده می‌کنیم
// در development از localhost استفاده می‌کنیم
export const API_BASE_URL = import.meta.env.VITE_API_URL || (isProduction ? PRODUCTION_API_URL : LOCAL_API_URL);

// Helper function for API calls with fallback
async function apiCall(endpoint: string, options: RequestInit = {}) {
  // در development از proxy استفاده می‌کنیم (relative path)
  // در production از absolute URL استفاده می‌کنیم
  const useProxy = !isProduction;
  
  // منطق انتخاب URL:
  // 1. اگر VITE_API_URL تنظیم شده باشد، مستقیماً از آن استفاده می‌کنیم (بدون proxy)
  // 2. در development: به صورت پیش‌فرض به localhost می‌رود (مستقیم)
  //    اگر می‌خواهیم از proxy استفاده کنیم (که به production می‌رود)، باید VITE_USE_PROXY=true تنظیم کنیم
  // 3. در production: از production URL استفاده می‌کنیم (مستقیم)
  let primaryUrl: string;
  if (import.meta.env.VITE_API_URL) {
    // اگر VITE_API_URL تنظیم شده، مستقیماً از آن استفاده می‌کنیم (بدون proxy)
    primaryUrl = import.meta.env.VITE_API_URL;
  } else if (useProxy && import.meta.env.VITE_USE_PROXY === 'true') {
    // در development، فقط اگر VITE_USE_PROXY=true باشد، از proxy استفاده می‌کنیم
    primaryUrl = '';
  } else if (useProxy) {
    // در development، به صورت پیش‌فرض به localhost می‌رود
    primaryUrl = LOCAL_API_URL;
  } else {
    // در production از production URL استفاده می‌کنیم (مستقیم)
    primaryUrl = PRODUCTION_API_URL;
  }
  
  const fallbackUrl = useProxy ? (primaryUrl === LOCAL_API_URL ? PRODUCTION_API_URL : LOCAL_API_URL) : (primaryUrl === PRODUCTION_API_URL ? LOCAL_API_URL : PRODUCTION_API_URL);
  
  const makeRequest = async (baseUrl: string) => {
    // اگر baseUrl خالی است، از relative path استفاده می‌کنیم (proxy)
    const url = baseUrl ? `${baseUrl}${endpoint}` : endpoint;
    
    const defaultOptions: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      // اضافه کردن credentials به صورت پیش‌فرض برای ارسال cookie
      credentials: options.credentials || 'include',
      // اضافه کردن cache control
      cache: 'no-cache',
    };

    // اضافه کردن timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 ثانیه timeout (افزایش یافت)
    
    try {
      // Debug: نمایش جزئیات درخواست
      if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        console.log(`[API] Fetching:`, { 
          url, 
          method: defaultOptions.method || 'GET',
          hasBody: !!defaultOptions.body,
          credentials: defaultOptions.credentials
        });
      }
      
      const response = await fetch(url, {
        ...defaultOptions,
        signal: controller.signal,
        mode: 'cors', // اضافه کردن mode برای CORS
      });
      
      clearTimeout(timeoutId);
      
      // Debug: نمایش response status
      if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        console.log(`[API] Response status: ${response.status} ${response.statusText}`, { url, ok: response.ok });
      }
      
      if (!response.ok) {
        let errorData: any = { error: 'Unknown error' };
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            errorData = await response.json();
          } else {
            const text = await response.text();
            if (text) {
              try {
                errorData = JSON.parse(text);
              } catch {
                errorData = { error: text || `API request failed: ${response.status}` };
              }
            }
          }
        } catch (e) {
          // اگر نتوانستیم JSON را parse کنیم، از status code استفاده می‌کنیم
          errorData = { error: `API request failed: ${response.status}` };
        }
        
        // برای خطاهای HTTP، یک Error با پیام اصلی throw کن
        // این Error نباید به عنوان خطای شبکه تشخیص داده شود
        const errorMessage = errorData.detail || errorData.error || errorData.message || errorData.msg || `API request failed: ${response.status}`;
        const httpError = new Error(errorMessage);
        // علامت‌گذاری که این خطای HTTP است (نه خطای شبکه)
        (httpError as any).isHttpError = true;
        (httpError as any).statusCode = response.status;
        throw httpError;
      }
      
      try {
        return await response.json();
      } catch (jsonError: any) {
        // اگر response.ok است اما JSON parse نشد، این یک خطای HTTP است
        // نه خطای شبکه
        if (response.ok) {
          throw new Error('خطا در پردازش پاسخ سرور');
        }
        // اگر response.ok false است، خطای HTTP قبلاً throw شده است
        // پس این خطا نباید رخ دهد، اما برای اطمینان:
        throw jsonError;
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      // Debug: نمایش خطا
      if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        console.error(`[API] Request error:`, { 
          url, 
          error: error.message, 
          name: error.name,
          isAbortError: error.name === 'AbortError',
          isTimeout: error.message?.includes('aborted')
        });
      }
      
      // اگر خطای HTTP است، آن را مستقیماً throw کن (بدون تغییر)
      if (error.isHttpError) {
        throw error;
      }
      // برای timeout
      if (error.name === 'AbortError') {
        throw new Error('مشکل در سرور با ادمین تماس بگیرید');
      }
      // برای خطاهای شبکه دیگر هم این پیام را نمایش بده
      if (error.message && (
        error.message.includes('Failed to fetch') ||
        error.message.includes('NetworkError') ||
        error.message.includes('Network request failed')
      )) {
        throw new Error('مشکل در سرور با ادمین تماس بگیرید');
      }
      throw error;
    }
  };

  // تلاش با URL اصلی (proxy یا direct)
  try {
    // Debug: نمایش URL که استفاده می‌شود
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      const debugUrl = primaryUrl ? `${primaryUrl}${endpoint}` : endpoint;
      console.log(`[API] Making request to: ${debugUrl}`, { primaryUrl, endpoint, useProxy });
    }
    const result = await makeRequest(primaryUrl);
    return result;
  } catch (error: any) {
    // اگر خطای HTTP است (نه خطای شبکه)، مستقیماً throw کن
    if (error.isHttpError) {
      throw error;
    }
    
    // فقط خطاهای واقعی شبکه (نه خطاهای HTTP) را تشخیص بده
    // خطاهای HTTP (مثل 401, 403, 404) باید پیام اصلی خودشان را داشته باشند
    const isRealNetworkError = error.name === 'AbortError' ||
                              error.message.includes('Failed to fetch') || 
                              error.message.includes('NetworkError') ||
                              error.message.includes('Network request failed') ||
                              error.message.includes('مشکل در سرور با ادمین تماس بگیرید');
    
    // فقط اگر primaryUrl همان localhost است و خطای شبکه واقعی است (نه timeout)، به production fallback کن
    // در production نباید به localhost fallback کنیم
    // اگر timeout شده (AbortError)، به fallback نرو - این یعنی Backend پاسخ نمی‌دهد
    const isTimeout = error.name === 'AbortError' || error.message?.includes('aborted');
    const shouldUseFallback = isRealNetworkError && 
                              !isTimeout && // اگر timeout شده، fallback نکن
                              fallbackUrl && 
                              fallbackUrl !== primaryUrl &&
                              (primaryUrl === LOCAL_API_URL || primaryUrl === '') &&
                              !isProduction;
    
    if (shouldUseFallback) {
      try {
        return await makeRequest(fallbackUrl);
      } catch (fallbackError: any) {
        // اگر fallback هم خطای شبکه بود، پیام عمومی را نمایش بده
        const isFallbackNetworkError = fallbackError.name === 'AbortError' ||
                                      fallbackError.message.includes('Failed to fetch') || 
                                      fallbackError.message.includes('NetworkError') ||
                                      fallbackError.message.includes('Network request failed') ||
                                      fallbackError.message.includes('مشکل در سرور با ادمین تماس بگیرید');
        if (isFallbackNetworkError) {
          throw new Error('مشکل در سرور با ادمین تماس بگیرید');
        }
        // برای خطاهای دیگر (مثلاً 400, 401, 404) پیام اصلی را نمایش بده
        throw fallbackError;
      }
    }
    
    // اگر خطای شبکه واقعی بود اما fallback استفاده نشد، پیام عمومی را نمایش بده
    if (isRealNetworkError) {
      throw new Error('مشکل در سرور با ادمین تماس بگیرید');
    }
    
    // برای خطاهای دیگر (مثلاً 400, 401, 404, 500) پیام اصلی را نمایش بده
    throw error;
  }
}

// Auth API
export const authAPI = {
  register: async (data: { username: string; password: string; email?: string; fullName?: string }) => {
    return apiCall('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
      credentials: 'include', // فقط برای auth
    });
  },

  login: async (data: { username: string; password: string }) => {
    return apiCall('/api/auth/login', {
      method: 'PUT',
      body: JSON.stringify(data),
      credentials: 'include', // فقط برای auth
    });
  },

  logout: async () => {
    return apiCall('/api/auth/logout', {
      method: 'DELETE',
      credentials: 'include', // فقط برای auth
    });
  },

  getCurrentUser: async () => {
    return apiCall('/api/auth/me', {
      method: 'GET',
      credentials: 'include', // فقط برای auth
    });
  },
};

// Nearby Stores API
export const nearbyStoresAPI = {
  getNearbyStores: async (params: {
    lat: number;
    lng: number;
    maxDistance?: number;
    category?: string;
    city?: string;
    neighborhood?: string;
  }) => {
    const queryParams = new URLSearchParams();
    queryParams.append('lat', params.lat.toString());
    queryParams.append('lng', params.lng.toString());
    if (params.maxDistance) queryParams.append('maxDistance', params.maxDistance.toString());
    if (params.category) queryParams.append('category', params.category);
    if (params.city) queryParams.append('city', params.city);
    if (params.neighborhood) queryParams.append('neighborhood', params.neighborhood);

    return apiCall(`/api/nearby-stores?${queryParams.toString()}`, {
      method: 'GET',
    });
  },

        getStoresByNeighborhood: async (params: {
          neighborhood: string;
          city?: string;
          lat?: number;
          lng?: number;
          limit?: number;
        }) => {
          const queryParams = new URLSearchParams();
          queryParams.append('neighborhood', params.neighborhood);
          if (params.city) queryParams.append('city', params.city);
          if (params.lat !== undefined) queryParams.append('lat', params.lat.toString());
          if (params.lng !== undefined) queryParams.append('lng', params.lng.toString());
          if (params.limit) queryParams.append('limit', params.limit.toString());

          return apiCall(`/api/stores-by-neighborhood?${queryParams.toString()}`, {
            method: 'GET',
          });
        },
};

// Store Comments API
export const storeCommentsAPI = {
  createComment: async (data: {
    storeId: number;
    comment: string;
    rating?: number;
    userLat?: number;
    userLng?: number;
    imageUrls?: string[];
  }) => {
    return apiCall('/api/store-comments', {
      method: 'POST',
      body: JSON.stringify(data),
      credentials: 'include', // برای ارسال cookie
    });
  },

  getComments: async (storeId: number) => {
    return apiCall(`/api/store-comments?storeId=${storeId}`, {
      method: 'GET',
    });
  },

  uploadImage: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const response = await fetch(`${baseURL}/api/upload-comment-image`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error('خطا در آپلود عکس');
    }
    
    return response.json();
  },
};

// User Location API
export const userLocationAPI = {
  updateLocation: async (lat: number, lng: number) => {
    return apiCall(`/api/update-user-location?lat=${lat}&lng=${lng}`, {
      method: 'POST',
      credentials: 'include',
    });
  },

  getNeighborhood: async (lat: number, lng: number) => {
    return apiCall(`/api/get-neighborhood?lat=${lat}&lng=${lng}`, {
      method: 'GET',
    });
  },

  getAddress: async (lat: number, lng: number) => {
    return apiCall(`/api/get-address?lat=${lat}&lng=${lng}`, {
      method: 'GET',
    });
  },
};

// Store Groups API
export const storeGroupsAPI = {
  createGroup: async (data: {
    storeIds: number[];
    groupCode?: string;
    groupName?: string;
  }) => {
    return apiCall('/api/store-groups', {
      method: 'POST',
      body: JSON.stringify(data),
      credentials: 'include', // برای ارسال cookie
    });
  },

  getGroups: async (params?: { groupCode?: string; storeId?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.groupCode) queryParams.append('groupCode', params.groupCode);
    if (params?.storeId) queryParams.append('storeId', params.storeId.toString());

    const queryString = queryParams.toString();
    return apiCall(`/api/store-groups${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
    });
  },

  deleteGroup: async (groupCode: string, storeId?: number) => {
    const queryParams = new URLSearchParams();
    queryParams.append('groupCode', groupCode);
    if (storeId) queryParams.append('storeId', storeId.toString());

    return apiCall(`/api/store-groups?${queryParams.toString()}`, {
      method: 'DELETE',
      credentials: 'include', // برای ارسال cookie
    });
  },
};

// Assigned Stores API (Market Visit)
export const assignedStoresAPI = {
  getAssignedStores: async (params?: {
    userId?: number;
    assignedDate?: string;
    status?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.userId) queryParams.append('userId', params.userId.toString());
    if (params?.assignedDate) queryParams.append('assignedDate', params.assignedDate);
    if (params?.status) queryParams.append('status', params.status);

    const queryString = queryParams.toString();
    return apiCall(`/api/assigned-stores${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
      credentials: 'include',
    });
  },
};

// Store Visit Data API
export const visitDataAPI = {
  submitVisitData: async (data: {
    assignmentId: number;
    visitDate: string;
    visitTime?: string;
    imageUrls?: string[];
    additionalInfo?: Record<string, any>;
    latitude?: number;
    longitude?: number;
  }) => {
    return apiCall('/api/store-visit-data', {
      method: 'POST',
      body: JSON.stringify(data),
      credentials: 'include',
    });
  },

  getVisitData: async (params?: {
    assignmentId?: number;
    storeId?: number;
    userId?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.assignmentId) queryParams.append('assignmentId', params.assignmentId.toString());
    if (params?.storeId) queryParams.append('storeId', params.storeId.toString());
    if (params?.userId) queryParams.append('userId', params.userId.toString());

    const queryString = queryParams.toString();
    return apiCall(`/api/store-visit-data${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
      credentials: 'include',
    });
  },
};

// Register Store API
export const registerNewStoreAPI = {
  registerStore: async (data: {
    name: string;
    address: string;
    lat?: number;
    lng?: number;
    category: string;
    categorySlug?: string;
    phone?: string;
    city?: string;
    province?: string;
    plateNumber?: string;
    postalCode?: string;
    isActive?: boolean;
    imageUrls?: string[];
    placeFullData?: Record<string, any>; // داده‌های کامل از API (مثل بلد)
  }) => {
    return apiCall('/api/register-store', {
      method: 'POST',
      body: JSON.stringify(data),
      credentials: 'include',
    });
  },
};

// Reverse Geocoding API
export const reverseGeocodingAPI = {
  getAddress: async (lat: number, lng: number) => {
    try {
      const response = await fetch(
        `https://reverse-geocoding.raah.ir/v1/features?result_type=city&location=${lng},${lat}`
      );
      if (!response.ok) {
        throw new Error('خطا در دریافت آدرس');
      }
      const data = await response.json();
      return data.name || '';
    } catch (error: any) {
      return '';
    }
  },
  
  getNeighborhood: async (lat: number, lng: number) => {
    try {
      const url = `https://reverse-geocoding.raah.ir/v1/features?result_type=neighborhood&location=${lng},${lat}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`خطا در دریافت محله: ${response.status}`);
      }
      
      const data = await response.json();
      
      // بررسی ساختارهای مختلف پاسخ
      let neighborhood_name = null;
      
      // روش 1: بررسی features array
      if (data.features && Array.isArray(data.features) && data.features.length > 0) {
        const feature = data.features[0];
        
        if (feature && typeof feature === 'object') {
          // بررسی properties.name
          if (feature.properties && typeof feature.properties === 'object' && feature.properties.name) {
            neighborhood_name = feature.properties.name;
          }
          
          // اگر پیدا نشد، بررسی مستقیم name
          if (!neighborhood_name && feature.name) {
            neighborhood_name = feature.name;
          }
        }
      }
      
      // روش 2: بررسی مستقیم name در root
      if (!neighborhood_name && data.name) {
        neighborhood_name = data.name;
      }
      
      // روش 3: بررسی در data.properties.name
      if (!neighborhood_name && data.properties && data.properties.name) {
        neighborhood_name = data.properties.name;
      }
      
      if (neighborhood_name) {
        return neighborhood_name.trim();
      } else {
        return '';
      }
    } catch (error: any) {
      return '';
    }
  },
};

// Store Categories API
export const storeCategoriesAPI = {
  getCategories: async () => {
    return apiCall('/api/store-categories', {
      method: 'GET',
    });
  },
};

// Store Deactivation API
export const storeDeactivationAPI = {
  createRequest: async (data: {
    storeId: number;
    reason?: string;
  }) => {
    return apiCall('/api/store-deactivation-request', {
      method: 'POST',
      body: JSON.stringify(data),
      credentials: 'include',
    });
  },

  reviewRequest: async (data: {
    requestId: number;
    action: 'approve' | 'reject';
    notes?: string;
  }) => {
    return apiCall('/api/review-deactivation-request', {
      method: 'POST',
      body: JSON.stringify(data),
      credentials: 'include',
    });
  },

  getRequests: async (status?: string) => {
    const queryParams = new URLSearchParams();
    if (status) queryParams.append('status', status);

    return apiCall(`/api/deactivation-requests?${queryParams.toString()}`, {
      method: 'GET',
      credentials: 'include',
    });
  },
};

// Store Workshop API
export const storeWorkshopAPI = {
  updateWorkshopStatus: async (data: {
    storeId: number;
    hasWorkshop: boolean;
  }) => {
    return apiCall('/api/store-workshop', {
      method: 'PATCH',
      body: JSON.stringify(data),
      credentials: 'include',
    });
  },
};

