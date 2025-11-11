import { useEffect, useState } from 'react';
import { toJalaliDateTime } from '../lib/dateUtils';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { authAPI, nearbyStoresAPI, storeCommentsAPI, storeGroupsAPI } from '../lib/api';
import { getCategoryIconByName, getCategoryIcon } from '../lib/categoryIcons';

// Fix Leaflet default icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface Store {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
  categorySlug?: string; // slug دسته‌بندی برای آیکن
  city: string;
  province: string;
  phone: string;
  rating: number | null;
  token: string;
  neighborhood: string;
  distance: number;
  groupCode?: string;
}

interface UserLocation {
  lat: number;
  lng: number;
  accuracy?: number;
}

interface Comment {
  id: number;
  store_id: number;
  user_id: number;
  username: string;
  fullName: string | null;
  comment: string;
  rating: number | null;
  created_at: string;
}

interface User {
  id: number;
  username: string;
  email: string | null;
  fullName: string | null;
}

// Component for map center control
function MapCenter({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  
  useEffect(() => {
    if (map) {
      map.setView(center, zoom);
    }
  }, [map, center, zoom]);
  
  return null;
}

export default function NearbyStoresMap() {
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maxDistance, setMaxDistance] = useState(200);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [selectedStoresForGroup, setSelectedStoresForGroup] = useState<number[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentRating, setCommentRating] = useState<number>(5);
  const [groupName, setGroupName] = useState('');
  const [existingGroupCode, setExistingGroupCode] = useState('');
  
  // Authentication
  const [user, setUser] = useState<User | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authFullName, setAuthFullName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Check auth status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Detect mobile device and handle resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setIsMobileMenuOpen(false);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Check authentication status
  const checkAuthStatus = async () => {
    try {
      const data = await authAPI.getCurrentUser();
      if (data.success) {
        setUser(data.user);
      }
    } catch (err) {
      // اگر خطا داد، کاربر را null نگه دار (بدون نمایش خطا)
      setUser(null);
      // فقط در development خطا را نمایش بده
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      }
    }
  };

  // Register
  const handleRegister = async () => {
    if (!authUsername || !authPassword) {
      setError('نام کاربری و رمز عبور الزامی است');
      return;
    }

    try {
      setAuthLoading(true);
      const data = await authAPI.register({
        username: authUsername,
        password: authPassword,
        email: authEmail || undefined,
        fullName: authFullName || undefined,
      });

      if (data.success) {
        setUser(data.user);
        setShowAuthModal(false);
        setAuthUsername('');
        setAuthPassword('');
        setAuthEmail('');
        setAuthFullName('');
        setError(null);
        alert('✅ ثبت‌نام با موفقیت انجام شد');
        // اطلاع به App.tsx برای به‌روزرسانی تب‌ها
        window.dispatchEvent(new Event('auth-changed'));
      } else {
        setError(data.error || 'خطا در ثبت‌نام');
      }
    } catch (err: any) {
      setError(`خطا: ${err.message}`);
    } finally {
      setAuthLoading(false);
    }
  };

  // Login
  const handleLogin = async () => {
    if (!authUsername || !authPassword) {
      setError('نام کاربری و رمز عبور الزامی است');
      return;
    }

    try {
      setAuthLoading(true);
      const data = await authAPI.login({
        username: authUsername,
        password: authPassword,
      });

      if (data.success) {
        setUser(data.user);
        setShowAuthModal(false);
        setAuthUsername('');
        setAuthPassword('');
        setError(null);
        alert('✅ ورود با موفقیت انجام شد');
        // اطلاع به App.tsx برای به‌روزرسانی تب‌ها
        window.dispatchEvent(new Event('auth-changed'));
      } else {
        setError(data.error || 'نام کاربری یا رمز عبور اشتباه است');
      }
    } catch (err: any) {
      setError(`خطا: ${err.message}`);
    } finally {
      setAuthLoading(false);
    }
  };

  // Logout
  const handleLogout = async () => {
    try {
      await authAPI.logout();
      setUser(null);
      alert('✅ خروج با موفقیت انجام شد');
      // اطلاع به App.tsx برای به‌روزرسانی تب‌ها
      window.dispatchEvent(new Event('auth-changed'));
    } catch (err: any) {
      setError(`خطا: ${err.message}`);
    }
  };

  // Get current location from GPS
  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('مرورگر شما از Geolocation پشتیبانی نمی‌کند');
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        setUserLocation(location);
        setError(null);
        fetchNearbyStores(location.lat, location.lng);
      },
      (err) => {
        setError(`خطا در دریافت موقعیت: ${err.message}`);
        setLoading(false);
      }
    );
  };

  // Fetch nearby stores
  const fetchNearbyStores = async (lat: number, lng: number) => {
    try {
      setLoading(true);
      setError(null); // پاک کردن خطاهای قبلی
      const data = await nearbyStoresAPI.getNearbyStores({
        lat,
        lng,
        maxDistance,
      });

      if (data.success) {
        setStores(data.stores);
        setError(null);
        if (data.stores.length === 0) {
          setError(`هیچ مغازه‌ای در فاصله ${maxDistance} متری پیدا نشد. فاصله را افزایش دهید.`);
        }
      } else {
        setError(data.error || 'خطا در دریافت داده‌ها');
      }
    } catch (err: any) {
      setError(`خطا در اتصال به سرور: ${err.message}. لطفاً مطمئن شوید که backend در حال اجراست.`);
    } finally {
      setLoading(false);
    }
  };

  // Set manual location
  const setManualLocation = () => {
    const latInput = document.getElementById('manual-lat') as HTMLInputElement;
    const lngInput = document.getElementById('manual-lng') as HTMLInputElement;
    
    if (latInput && lngInput) {
      const lat = parseFloat(latInput.value);
      const lng = parseFloat(lngInput.value);
      
      if (!isNaN(lat) && !isNaN(lng)) {
        const location = { lat, lng };
        setUserLocation(location);
        fetchNearbyStores(lat, lng);
      }
    }
  };

  // Fetch comments for a store
  const fetchComments = async (storeId: number) => {
    try {
      const data = await storeCommentsAPI.getComments(storeId);
      if (data.success) {
        setComments(data.comments);
      }
    } catch (err: any) {
    }
  };

  // Submit comment
  const submitComment = async () => {
    if (!user) {
      setShowCommentModal(false);
      setShowAuthModal(true);
      setAuthMode('login');
      setError('برای ثبت نظر باید وارد شوید');
      return;
    }

    if (!selectedStore || !commentText.trim()) {
      setError('لطفاً توضیحات را وارد کنید');
      return;
    }

    try {
      setLoading(true);
      const data = await storeCommentsAPI.createComment({
        storeId: selectedStore.id,
        comment: commentText,
        rating: commentRating,
        userLat: userLocation?.lat,
        userLng: userLocation?.lng,
      });

      if (data.success) {
        setCommentText('');
        setCommentRating(5);
        await fetchComments(selectedStore.id);
        setError(null);
        alert('✅ توضیحات با موفقیت ثبت شد');
      } else {
        setError(data.error || 'خطا در ثبت توضیحات');
      }
    } catch (err: any) {
      setError(`خطا: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Group stores
  const groupStores = async () => {
    if (selectedStoresForGroup.length < 2) {
      setError('حداقل 2 مغازه برای گروه‌بندی انتخاب کنید');
      return;
    }

    try {
      setLoading(true);
      const data = await storeGroupsAPI.createGroup({
        storeIds: selectedStoresForGroup,
        groupCode: existingGroupCode || undefined,
        groupName: groupName || undefined,
      });

      if (data.success) {
        setSelectedStoresForGroup([]);
        setGroupName('');
        setExistingGroupCode('');
        setShowGroupModal(false);
        setError(null);
        alert(`✅ ${data.addedCount} مغازه در گروه ${data.group.code} ثبت شد`);
        if (userLocation) {
          fetchNearbyStores(userLocation.lat, userLocation.lng);
        }
      } else {
        setError(data.error || 'خطا در گروه‌بندی');
      }
    } catch (err: any) {
      setError(`خطا: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Open comment modal
  const openCommentModal = async (store: Store) => {
    setSelectedStore(store);
    setShowCommentModal(true);
    await fetchComments(store.id);
    
    // اگر کاربر وارد نشده، فقط نمایش نظرات (بدون امکان ثبت)
    if (!user) {
      // فقط نظرات را نمایش می‌دهیم، دکمه ثبت نظر غیرفعال می‌ماند
    }
  };

  // Toggle store selection for grouping
  const toggleStoreSelection = (storeId: number) => {
    setSelectedStoresForGroup((prev) =>
      prev.includes(storeId)
        ? prev.filter((id) => id !== storeId)
        : [...prev, storeId]
    );
  };

  // Get category icon
  const getCategoryIconForStore = (store: Store): string => {
    if (store.categorySlug) {
      return getCategoryIcon(store.categorySlug);
    }
    return getCategoryIconByName(store.category);
  };

  // Get marker color by category
  const getMarkerColor = (category: string): string => {
    const colors: { [key: string]: string } = {
      'رستوران': 'red',
      'کافه': 'brown',
      'فروشگاه': 'blue',
      'سوپرمارکت': 'green',
      'داروخانه': 'purple',
    };
    return colors[category] || 'gray';
  };

  // Create custom icon with emoji
  const createCustomIcon = (store: Store) => {
    const iconEmoji = getCategoryIconForStore(store);
    const color = getMarkerColor(store.category);
    
    // استفاده از createElement برای اطمینان از نمایش صحیح emoji
    const div = document.createElement('div');
    div.style.cssText = `
      background-color: ${color};
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      line-height: 1;
      text-align: center;
      font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', 'EmojiOne Color', 'Android Emoji', sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    `;
    div.textContent = iconEmoji;
    
    return L.divIcon({
      className: 'custom-marker',
      html: div.outerHTML,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -20],
    });
  };

  const defaultCenter: [number, number] = [35.6892, 51.3890]; // Tehran
  const mapCenter: [number, number] = userLocation 
    ? [userLocation.lat, userLocation.lng]
    : defaultCenter;

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "'Vazirmatn', 'Tahoma', 'Arial', sans-serif", position: 'relative' }}>
      {/* Mobile Menu Button */}
      {isMobile && (
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          style={{
            position: 'fixed',
            top: '10px',
            right: '10px',
            zIndex: 1001,
            padding: '10px',
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '20px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {isMobileMenuOpen ? '✕' : '☰'}
        </button>
      )}

      {/* Mobile Overlay */}
      {isMobile && isMobileMenuOpen && (
        <div
          onClick={() => setIsMobileMenuOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 999
          }}
        />
      )}

      {/* Sidebar */}
      <div style={{ 
        width: isMobile ? '85%' : '350px',
        maxWidth: isMobile ? '400px' : '350px',
        backgroundColor: '#f5f5f5', 
        padding: '20px', 
        overflowY: 'auto',
        borderRight: isMobile ? 'none' : '1px solid #ddd',
        position: isMobile ? 'fixed' : 'relative',
        top: 0,
        right: isMobile ? (isMobileMenuOpen ? 0 : '-100%') : 0,
        height: '100vh',
        zIndex: 1000,
        transition: 'right 0.3s ease-in-out',
        boxShadow: isMobile ? '2px 0 8px rgba(0,0,0,0.2)' : 'none'
      }}>
        <h1 style={{ marginTop: 0, color: '#1976D2', fontSize: '24px', fontWeight: 700 }}>نقشه مغازه‌ها</h1>

        {/* Authentication Section */}
        {user ? (
          <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#e8f5e9', borderRadius: '8px' }}>
            <p style={{ margin: '5px 0' }}>👤 کاربر: <strong>{user.username}</strong></p>
            {user.fullName && <p style={{ margin: '5px 0' }}>نام: {user.fullName}</p>}
            <button 
              onClick={handleLogout}
              style={{
                marginTop: '10px',
                padding: '8px 16px',
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                width: '100%'
              }}
            >
              خروج
            </button>
          </div>
        ) : (
          <div style={{ marginBottom: '20px' }}>
            <button 
              onClick={() => {
                setShowAuthModal(true);
                setAuthMode('login');
              }}
              style={{
                padding: '10px',
                backgroundColor: '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                width: '100%',
                marginBottom: '10px'
              }}
            >
              ورود / ثبت‌نام
            </button>
          </div>
        )}

        {/* Location Section */}
        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: 'white', borderRadius: '8px' }}>
          <h3 style={{ marginTop: 0 }}>موقعیت من</h3>
          <button 
            onClick={getCurrentLocation}
            disabled={loading}
            style={{
              padding: '10px',
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              width: '100%',
              marginBottom: '10px'
            }}
          >
            {loading ? 'در حال دریافت...' : '📍 دریافت موقعیت GPS'}
          </button>
          
          <div style={{ marginBottom: '10px' }}>
            <input
              id="manual-lat"
              type="number"
              placeholder="عرض جغرافیایی"
              step="0.000001"
              style={{ width: '100%', padding: '8px', marginBottom: '5px', borderRadius: '4px', border: '1px solid #ddd' }}
            />
            <input
              id="manual-lng"
              type="number"
              placeholder="طول جغرافیایی"
              step="0.000001"
              style={{ width: '100%', padding: '8px', marginBottom: '5px', borderRadius: '4px', border: '1px solid #ddd' }}
            />
            <button 
              onClick={setManualLocation}
              style={{
                padding: '8px',
                backgroundColor: '#FF9800',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                width: '100%'
              }}
            >
              تنظیم دستی
            </button>
          </div>

          {userLocation && (
            <p style={{ fontSize: '12px', color: '#666' }}>
              موقعیت: {userLocation.lat.toFixed(6)}, {userLocation.lng.toFixed(6)}
            </p>
          )}

          <div style={{ marginTop: '10px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>
              حداکثر فاصله (متر):
            </label>
            <input
              type="number"
              value={maxDistance}
              onChange={(e) => setMaxDistance(parseInt(e.target.value) || 200)}
              min="100"
              max="10000"
              step="100"
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
            />
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div style={{ 
            padding: '10px', 
            backgroundColor: '#ffebee', 
            color: '#c62828', 
            borderRadius: '4px',
            marginBottom: '20px'
          }}>
            {error}
          </div>
        )}

        {/* Stores List */}
        <div>
          <h3>مغازه‌های نزدیک ({stores.length})</h3>
          {stores.length === 0 && !loading && (
            <p style={{ color: '#666' }}>مغازه‌ای یافت نشد</p>
          )}
          {stores.map((store) => (
            <div 
              key={store.id}
              style={{
                padding: '10px',
                marginBottom: '10px',
                backgroundColor: 'white',
                borderRadius: '4px',
                border: selectedStoresForGroup.includes(store.id) ? '2px solid #2196F3' : '1px solid #ddd',
                cursor: 'pointer',
                touchAction: 'manipulation'
              }}
              onClick={() => {
                toggleStoreSelection(store.id);
                if (isMobile) setIsMobileMenuOpen(false);
              }}
            >
              <h4 style={{ margin: '5px 0', color: '#1976D2', fontWeight: 600 }}>
                {getCategoryIconForStore(store)} {store.name}
              </h4>
              <p style={{ margin: '5px 0', fontSize: '13px', color: '#424242', lineHeight: '1.6' }}>
                📍 {store.address}
              </p>
              <p style={{ margin: '5px 0', fontSize: '13px', color: '#616161', lineHeight: '1.6' }}>
                {getCategoryIconForStore(store)} {store.category} | 📏 {store.distance.toFixed(0)} متر
              </p>
              {store.phone && (
                <p style={{ margin: '5px 0', fontSize: '13px', color: '#616161', lineHeight: '1.6' }}>
                  📞 {store.phone}
                </p>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openCommentModal(store);
                  if (isMobile) setIsMobileMenuOpen(false);
                }}
                style={{
                  marginTop: '5px',
                  padding: '5px 10px',
                  backgroundColor: '#9C27B0',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  touchAction: 'manipulation'
                }}
              >
                💬 نظرات
              </button>
            </div>
          ))}
        </div>

        {/* Group Button */}
        {selectedStoresForGroup.length >= 2 && (
          <button
            onClick={() => setShowGroupModal(true)}
            style={{
              position: 'fixed',
              bottom: '20px',
              right: '20px',
              padding: '15px 25px',
              backgroundColor: '#FF5722',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '16px',
              boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
              zIndex: 1000
            }}
          >
            گروه‌بندی ({selectedStoresForGroup.length})
          </button>
        )}
      </div>

      {/* Map */}
      <div style={{ 
        flex: 1, 
        position: 'relative',
        width: isMobile && isMobileMenuOpen ? '100%' : '100%',
        height: '100vh'
      }}>
        {userLocation && (
          <MapContainer
            center={mapCenter}
            zoom={15}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            <MapCenter center={mapCenter} zoom={15} />
            
            {/* User Location Circle */}
            <Circle
              center={[userLocation.lat, userLocation.lng]}
              radius={maxDistance}
              pathOptions={{ color: 'blue', fillColor: 'blue', fillOpacity: 0.1 }}
            />
            
            {/* User Location Marker */}
            <Marker position={[userLocation.lat, userLocation.lng]}>
              <Popup>📍 موقعیت شما</Popup>
            </Marker>

            {/* Store Markers */}
            {stores.map((store) => (
              <Marker
                key={store.id}
                position={[store.lat, store.lng]}
                icon={createCustomIcon(store)}
              >
                <Popup>
                  <div style={{ fontFamily: "'Vazirmatn', 'Tahoma', 'Arial', sans-serif", minWidth: '200px' }}>
                    <h4 style={{ margin: '5px 0', color: '#1976D2', fontWeight: 600 }}>
                      {getCategoryIconForStore(store)} {store.name}
                    </h4>
                    <p style={{ margin: '5px 0', fontSize: '13px', color: '#424242' }}>{store.address}</p>
                    <p style={{ margin: '5px 0', fontSize: '13px', color: '#616161' }}>
                      {store.category} | {store.distance.toFixed(0)} متر
                    </p>
                    <button
                      onClick={() => openCommentModal(store)}
                      style={{
                        padding: '5px 10px',
                        backgroundColor: '#9C27B0',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        marginTop: '5px',
                        fontFamily: "'Vazirmatn', 'Tahoma', 'Arial', sans-serif"
                      }}
                    >
                      نظرات
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>

      {/* Auth Modal */}
      {showAuthModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 2000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: isMobile ? '20px' : '30px',
            borderRadius: '8px',
            width: isMobile ? '95%' : '400px',
            maxWidth: '90%'
          }}>
            <h2 style={{ marginTop: 0 }}>
              {authMode === 'login' ? 'ورود' : 'ثبت‌نام'}
            </h2>
            <div style={{ marginBottom: '15px' }}>
              <input
                type="text"
                placeholder="نام کاربری"
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
                style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ddd' }}
              />
              <input
                type="password"
                placeholder="رمز عبور"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ddd' }}
              />
              {authMode === 'register' && (
                <>
                  <input
                    type="email"
                    placeholder="ایمیل (اختیاری)"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ddd' }}
                  />
                  <input
                    type="text"
                    placeholder="نام کامل (اختیاری)"
                    value={authFullName}
                    onChange={(e) => setAuthFullName(e.target.value)}
                    style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ddd' }}
                  />
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={authMode === 'login' ? handleLogin : handleRegister}
                disabled={authLoading}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: authLoading ? 'not-allowed' : 'pointer'
                }}
              >
                {authLoading ? 'در حال پردازش...' : (authMode === 'login' ? 'ورود' : 'ثبت‌نام')}
              </button>
              <button
                onClick={() => {
                  setShowAuthModal(false);
                  setAuthUsername('');
                  setAuthPassword('');
                  setAuthEmail('');
                  setAuthFullName('');
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#757575',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                انصراف
              </button>
            </div>
            <button
              onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
              style={{
                marginTop: '10px',
                padding: '5px',
                backgroundColor: 'transparent',
                border: 'none',
                color: '#2196F3',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              {authMode === 'login' ? 'حساب کاربری ندارید؟ ثبت‌نام کنید' : 'قبلاً ثبت‌نام کرده‌اید؟ وارد شوید'}
            </button>
          </div>
        </div>
      )}

      {/* Comment Modal */}
      {showCommentModal && selectedStore && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 2000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: isMobile ? '20px' : '30px',
            borderRadius: '8px',
            width: isMobile ? '95%' : '500px',
            maxWidth: '90%',
            maxHeight: '80%',
            overflowY: 'auto'
          }}>
            <h2 style={{ marginTop: 0 }}>نظرات - {selectedStore.name}</h2>
            
            {/* Comment Form - فقط برای کاربران وارد شده */}
            {user ? (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '5px' }}>امتیاز:</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={commentRating}
                  onChange={(e) => setCommentRating(parseInt(e.target.value) || 5)}
                  style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ddd' }}
                />
                <label style={{ display: 'block', marginBottom: '5px' }}>نظر:</label>
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  rows={4}
                  style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ddd' }}
                />
                <button
                  onClick={submitComment}
                  disabled={loading}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#4CAF50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    width: '100%'
                  }}
                >
                  {loading ? 'در حال ارسال...' : 'ثبت نظر'}
                </button>
              </div>
            ) : (
              <div style={{ 
                marginBottom: '20px', 
                padding: '15px', 
                backgroundColor: '#fff3cd', 
                borderRadius: '4px',
                border: '1px solid #ffc107'
              }}>
                <p style={{ margin: 0, color: '#856404' }}>
                  ⚠️ برای ثبت نظر باید وارد شوید. 
                  <button
                    onClick={() => {
                      setShowCommentModal(false);
                      setShowAuthModal(true);
                      setAuthMode('login');
                    }}
                    style={{
                      marginLeft: '10px',
                      padding: '5px 10px',
                      backgroundColor: '#2196F3',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    ورود / ثبت‌نام
                  </button>
                </p>
              </div>
            )}

            {/* Comments List */}
            <div>
              <h3>نظرات قبلی:</h3>
              {comments.length === 0 ? (
                <p style={{ color: '#666' }}>هنوز نظری ثبت نشده</p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} style={{
                    padding: '10px',
                    marginBottom: '10px',
                    backgroundColor: '#f5f5f5',
                    borderRadius: '4px'
                  }}>
                    <p style={{ margin: '5px 0', fontWeight: 'bold' }}>
                      {comment.username} {comment.fullName && `(${comment.fullName})`}
                    </p>
                    {comment.rating && (
                      <p style={{ margin: '5px 0' }}>⭐ {comment.rating}/5</p>
                    )}
                    <p style={{ margin: '5px 0' }}>{comment.comment}</p>
                    <p style={{ margin: '5px 0', fontSize: '12px', color: '#666' }}>
                      {toJalaliDateTime(comment.created_at)}
                    </p>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => {
                setShowCommentModal(false);
                setSelectedStore(null);
                setCommentText('');
                setCommentRating(5);
              }}
              style={{
                marginTop: '20px',
                padding: '10px 20px',
                backgroundColor: '#757575',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                width: '100%'
              }}
            >
              بستن
            </button>
          </div>
        </div>
      )}

      {/* Group Modal */}
      {showGroupModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 2000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: isMobile ? '20px' : '30px',
            borderRadius: '8px',
            width: isMobile ? '95%' : '500px',
            maxWidth: '90%'
          }}>
            <h2 style={{ marginTop: 0 }}>گروه‌بندی مغازه‌ها</h2>
            <p>تعداد مغازه‌های انتخاب شده: {selectedStoresForGroup.length}</p>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>نام گروه:</label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="نام گروه (اختیاری)"
                style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ddd' }}
              />
              <label style={{ display: 'block', marginBottom: '5px' }}>کد گروه موجود:</label>
              <input
                type="text"
                value={existingGroupCode}
                onChange={(e) => setExistingGroupCode(e.target.value)}
                placeholder="کد گروه موجود (اختیاری)"
                style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ddd' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={groupStores}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#FF5722',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? 'در حال پردازش...' : 'گروه‌بندی'}
              </button>
              <button
                onClick={() => {
                  setShowGroupModal(false);
                  setGroupName('');
                  setExistingGroupCode('');
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#757575',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

