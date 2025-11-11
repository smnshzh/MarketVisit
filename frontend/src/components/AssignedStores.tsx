import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { nearbyStoresAPI, registerNewStoreAPI, reverseGeocodingAPI, authAPI, storeCommentsAPI, userLocationAPI, storeDeactivationAPI, storeCategoriesAPI, storeWorkshopAPI } from '../lib/api';
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
  latitude: number;
  longitude: number;
  category: string;
  categorySlug?: string;
  distance?: number;
  phone?: string;
  rating?: number;
  ratingCount?: number;
  description?: string;
  website?: string;
  email?: string;
  priceRange?: string;
  hasWorkshop?: boolean;
}

function MapCenter({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  
  useEffect(() => {
    if (map && center && Array.isArray(center) && center.length === 2 && 
        typeof center[0] === 'number' && typeof center[1] === 'number' &&
        !isNaN(center[0]) && !isNaN(center[1])) {
      try {
        map.setView(center, zoom);
      } catch (error) {
        // Silent error
      }
    }
  }, [map, center, zoom]);
  
  return null;
}

// Component to handle map events (click, long press)
function MapEventHandler({ onLongPress }: { onLongPress: (lat: number, lng: number) => void }) {
  const map = useMap();
  const pressTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    const handleMouseDown = (e: any) => {
      pressTimerRef.current = setTimeout(() => {
        const { lat, lng } = e.latlng;
        onLongPress(lat, lng);
      }, 500); // 500ms for long press
    };
    
    const handleMouseUp = () => {
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }
    };
    
    const handleMouseMove = () => {
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }
    };
    
    map.on('mousedown', handleMouseDown);
    map.on('mouseup', handleMouseUp);
    map.on('mousemove', handleMouseMove);
    
    // Touch events for mobile
    map.on('touchstart', handleMouseDown);
    map.on('touchend', handleMouseUp);
    map.on('touchmove', handleMouseMove);
    
    return () => {
      map.off('mousedown', handleMouseDown);
      map.off('mouseup', handleMouseUp);
      map.off('mousemove', handleMouseMove);
      map.off('touchstart', handleMouseDown);
      map.off('touchend', handleMouseUp);
      map.off('touchmove', handleMouseMove);
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current);
      }
    };
  }, [map, onLongPress]);
  
  return null;
}

export default function AssignedStores() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [userNeighborhood, setUserNeighborhood] = useState<string | null>(null);
  const [useNeighborhoodFilter, setUseNeighborhoodFilter] = useState(true);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [showAddStoreModal, setShowAddStoreModal] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showList, setShowList] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [isMapFullScreen, setIsMapFullScreen] = useState(false);

  // Form state for adding new store
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreAddress, setNewStoreAddress] = useState('');
  const [newStoreCategory, setNewStoreCategory] = useState('');
  const [newStoreCategorySlug, setNewStoreCategorySlug] = useState('');
  const [newStorePhone, setNewStorePhone] = useState('');
  const [newStoreCity, setNewStoreCity] = useState('');
  const [newStoreProvince, setNewStoreProvince] = useState('');
  
  // Store categories state
  const [storeCategories, setStoreCategories] = useState<any[]>([]);
  const [selectedMainCategory, setSelectedMainCategory] = useState<string>('');
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [newStoreLat, setNewStoreLat] = useState<number | null>(null);
  const [newStoreLng, setNewStoreLng] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // New fields for store registration
  const [maxDistance, setMaxDistance] = useState(200); // Default 200 meters
  const [newStorePlateNumber, setNewStorePlateNumber] = useState('');
  const [newStorePostalCode, setNewStorePostalCode] = useState('');
  const [newStoreIsActive, setNewStoreIsActive] = useState(true);
  const [newStoreImages, setNewStoreImages] = useState<File[]>([]);
  const [newStoreImageUrls, setNewStoreImageUrls] = useState<string[]>([]);
  const [loadingAddress, setLoadingAddress] = useState(false);
  
  // Authentication state
  const [user, setUser] = useState<any>(null);
  
  // Store comment/photo panel state
  const [showStorePanel, setShowStorePanel] = useState(false);
  const [selectedStoreForPanel, setSelectedStoreForPanel] = useState<Store | null>(null);
  const [commentText, setCommentText] = useState('');
  const [commentRating, setCommentRating] = useState(5);
  const [commentImages, setCommentImages] = useState<File[]>([]);
  const [commentImageUrls, setCommentImageUrls] = useState<string[]>([]);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [storeComments, setStoreComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  
  // Store deactivation state
  const [showDeactivationModal, setShowDeactivationModal] = useState(false);
  const [selectedStoreForDeactivation, setSelectedStoreForDeactivation] = useState<Store | null>(null);
  const [deactivationReason, setDeactivationReason] = useState('');
  const [submittingDeactivation, setSubmittingDeactivation] = useState(false);
  
  // Login modal state
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  
  // Neighborhood stores state
  const [showNeighborhoodStores, setShowNeighborhoodStores] = useState(false);
  const [neighborhoodStores, setNeighborhoodStores] = useState<Store[]>([]);
  const [loadingNeighborhoodStores, setLoadingNeighborhoodStores] = useState(false);

  // Get category icon
  const getCategoryIconForStore = (store: Store): string => {
    if (store.categorySlug) {
      return getCategoryIcon(store.categorySlug);
    }
    return getCategoryIconByName(store.category);
  };

  // Create custom icon with emoji
  const createCustomIcon = (store: Store, color: string = '#2196F3') => {
    const iconEmoji = getCategoryIconForStore(store);
    
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
      font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
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

  // Check authentication status
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const response = await authAPI.getCurrentUser();
        if (response.success && response.user) {
          setUser(response.user);
        }
      } catch (error) {
        setUser(null);
      }
    };
    checkAuthStatus();
  }, []);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Get user location automatically and get neighborhood
  useEffect(() => {
    const initializeLocation = async () => {
      if (navigator.geolocation) {
        setLoading(true);
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            setUserLocation([lat, lng]);
            
            // دریافت محله کاربر
            const neighborhood = await getUserNeighborhood(lat, lng);
            
            if (neighborhood) {
              setUserNeighborhood(neighborhood);
            } else {
              setUserNeighborhood(null);
            }
            
            // بارگذاری مغازه‌های همان محله (یا همه اگر محله پیدا نشد)
            await loadNearbyStores(lat, lng, neighborhood);
          },
          async (_err) => {
            setError('خطا در دریافت موقعیت. لطفاً دسترسی موقعیت را فعال کنید.');
            setLoading(false);
            // Default to Tehran if location is not available
            const defaultLat = 35.6892;
            const defaultLng = 51.3890;
            setUserLocation([defaultLat, defaultLng]);
            
            // دریافت محله برای موقعیت پیش‌فرض
            const neighborhood = await getUserNeighborhood(defaultLat, defaultLng);
            if (neighborhood) {
              setUserNeighborhood(neighborhood);
            }
            
            await loadNearbyStores(defaultLat, defaultLng, neighborhood);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
          }
        );
      } else {
        setError('مرورگر شما از دریافت موقعیت پشتیبانی نمی‌کند.');
        // Default to Tehran
        const defaultLat = 35.6892;
        const defaultLng = 51.3890;
        setUserLocation([defaultLat, defaultLng]);
        
        // دریافت محله برای موقعیت پیش‌فرض
        getUserNeighborhood(defaultLat, defaultLng).then(neighborhood => {
          if (neighborhood) {
            setUserNeighborhood(neighborhood);
          }
          loadNearbyStores(defaultLat, defaultLng, neighborhood);
        });
      }
    };
    
    initializeLocation();
    
    // بارگذاری دسته‌بندی‌ها
    const loadCategories = async () => {
      setLoadingCategories(true);
      try {
        const response = await storeCategoriesAPI.getCategories();
        if (response.success && response.results) {
          setStoreCategories(response.results);
        } else {
          setError('خطا در دریافت دسته‌بندی‌ها. لطفاً دوباره تلاش کنید.');
        }
      } catch (error: any) {
        setError(`خطا در دریافت دسته‌بندی‌ها: ${error.message || 'خطای نامشخص'}`);
      } finally {
        setLoadingCategories(false);
      }
    };
    
    loadCategories();
  }, []);

  // دریافت محله کاربر از API (از backend)
  const getUserNeighborhood = async (lat: number, lng: number): Promise<string | null> => {
    try {
      // استفاده از backend API برای دریافت محله
      const response = await userLocationAPI.getNeighborhood(lat, lng);
      
      if (response.success && response.neighborhood) {
        const neighborhood = response.neighborhood.trim();
        return neighborhood;
      } else {
        // Fallback به frontend API
        let neighborhood = await reverseGeocodingAPI.getNeighborhood(lat, lng);
        
        if (!neighborhood || neighborhood.trim().length === 0) {
          const city = await reverseGeocodingAPI.getAddress(lat, lng);
          if (city && city.trim().length > 0) {
            neighborhood = city.trim();
          }
        }
        
        if (neighborhood && neighborhood.trim().length > 0) {
          return neighborhood.trim();
        }
      }
      
      return null;
    } catch (error) {
      // Fallback به frontend API در صورت خطا
      try {
        let neighborhood = await reverseGeocodingAPI.getNeighborhood(lat, lng);
        if (!neighborhood || neighborhood.trim().length === 0) {
          const city = await reverseGeocodingAPI.getAddress(lat, lng);
          if (city && city.trim().length > 0) {
            neighborhood = city.trim();
          }
        }
        if (neighborhood && neighborhood.trim().length > 0) {
          return neighborhood.trim();
        }
      } catch (fallbackError) {
        // Silent fallback error
      }
      return null;
    }
  };

  const loadNearbyStores = async (lat: number, lng: number, neighborhood?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const params: any = {
        lat,
        lng,
        maxDistance: maxDistance, // Use user-defined distance
      };
      
      // فقط اگر محله پیدا شد و کاربر می‌خواهد فیلتر شود، فیلتر را اعمال کن
      if (useNeighborhoodFilter && neighborhood && neighborhood.trim().length > 0) {
        params.neighborhood = neighborhood;
      }
      
      const response = await nearbyStoresAPI.getNearbyStores(params);
      
      if (response.success) {
        // Map API response to Store interface
        const mappedStores = (response.stores || []).map((store: any) => ({
          id: store.id,
          name: store.name,
          address: store.address || '',
          latitude: store.lat || store.latitude,
          longitude: store.lng || store.longitude,
          category: store.category || 'نامشخص',
          categorySlug: store.categorySlug,
          distance: store.distance,
          phone: store.phone,
          rating: store.rating,
          ratingCount: store.ratingCount,
          description: store.description,
          website: store.website,
          email: store.email,
          priceRange: store.priceRange,
          hasWorkshop: store.has_workshop || store.hasWorkshop || false,
        }));
        
        setStores(mappedStores);
      } else {
        setError('خطا در دریافت مغازه‌ها');
      }
    } catch (err: any) {
      setError(err.message || 'خطا در دریافت مغازه‌ها');
    } finally {
      setLoading(false);
    }
  };
  
  // Reload stores when maxDistance changes
  useEffect(() => {
    if (userLocation) {
      loadNearbyStores(userLocation[0], userLocation[1], userNeighborhood);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxDistance]);

  const handleAddStore = async (lat?: number, lng?: number) => {
    const storeLat = lat || userLocation?.[0] || null;
    const storeLng = lng || userLocation?.[1] || null;
    
    setNewStoreLat(storeLat);
    setNewStoreLng(storeLng);
    
    // Get address from backend API
    if (storeLat && storeLng) {
      setLoadingAddress(true);
      try {
        const response = await userLocationAPI.getAddress(storeLat, storeLng);
        if (response.success && response.address) {
          setNewStoreAddress(response.address);
          // استخراج city و province از components
          if (response.components) {
            if (response.components.city) {
              setNewStoreCity(response.components.city);
            }
            if (response.components.county) {
              setNewStoreProvince(response.components.county);
            }
          }
        } else {
          // Fallback to frontend API if backend fails
          try {
            const fallbackAddress = await reverseGeocodingAPI.getAddress(storeLat, storeLng);
            if (fallbackAddress) {
              setNewStoreAddress(fallbackAddress);
            }
          } catch (fallbackError) {
            setNewStoreAddress(''); // Leave empty if both fail
          }
        }
      } catch (error) {
        // Fallback to frontend API
        try {
          const fallbackAddress = await reverseGeocodingAPI.getAddress(storeLat, storeLng);
          if (fallbackAddress) {
            setNewStoreAddress(fallbackAddress);
          }
        } catch (fallbackError) {
          setNewStoreAddress(''); // Leave empty if both fail
        }
      } finally {
        setLoadingAddress(false);
      }
    }
    
    setShowAddStoreModal(true);
  };
  
  // Handle image upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) {
      setError('برای آپلود عکس باید وارد سیستم شوید');
      return;
    }
    
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setNewStoreImages([...newStoreImages, ...files]);
      // Create preview URLs
      const urls = files.map(file => URL.createObjectURL(file));
      setNewStoreImageUrls([...newStoreImageUrls, ...urls]);
    }
  };
  
  // Remove image
  const removeImage = (index: number) => {
    const newImages = [...newStoreImages];
    const newUrls = [...newStoreImageUrls];
    URL.revokeObjectURL(newUrls[index]);
    newImages.splice(index, 1);
    newUrls.splice(index, 1);
    setNewStoreImages(newImages);
    setNewStoreImageUrls(newUrls);
  };

  const submitNewStore = async () => {
    if (!newStoreName || !newStoreAddress || !newStoreCategory || !newStoreCategorySlug) {
      setError('لطفاً نام، آدرس و دسته مغازه را انتخاب کنید');
      return;
    }

    if (!newStoreLat || !newStoreLng) {
      setError('لطفاً موقعیت مغازه را مشخص کنید');
      return;
    }
    
    if (!user) {
      setError('برای ثبت مغازه باید وارد سیستم شوید');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      // TODO: Upload images to server and get URLs
      // For now, we'll use empty array
      const imageUrls: string[] = [];
      
      const response = await registerNewStoreAPI.registerStore({
        name: newStoreName,
        address: newStoreAddress,
        lat: newStoreLat,
        lng: newStoreLng,
        category: newStoreCategory,
        categorySlug: newStoreCategorySlug,
        phone: newStorePhone || undefined,
        city: newStoreCity || undefined,
        province: newStoreProvince || undefined,
        plateNumber: newStorePlateNumber || undefined,
        postalCode: newStorePostalCode || undefined,
        isActive: newStoreIsActive,
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        placeFullData: undefined, // TODO: اگر داده کامل از API بلد داریم، اینجا قرار بده
      });

      if (response.success && response.store) {
        // تبدیل پاسخ API به فرمت Store
        const newStore: Store = {
          id: response.store.id,
          name: response.store.name,
          address: response.store.address,
          latitude: response.store.lat,
          longitude: response.store.lng,
          category: response.store.category,
          categorySlug: response.store.categorySlug,
          phone: response.store.phone,
        };
        
        // اضافه کردن به لیست و بستن مودال
        setStores([...stores, newStore]);
        setShowAddStoreModal(false);
        // Reset form
        setNewStoreName('');
        setNewStoreAddress('');
        setNewStoreCategory('');
        setNewStoreCategorySlug('');
        setSelectedMainCategory('');
        setNewStorePhone('');
        setNewStoreCity('');
        setNewStoreProvince('');
        setNewStorePlateNumber('');
        setNewStorePostalCode('');
        setNewStoreIsActive(true);
        setNewStoreImages([]);
        setNewStoreImageUrls([]);
        setNewStoreLat(null);
        setNewStoreLng(null);
        
        // بارگذاری مجدد مغازه‌های نزدیک
        if (userLocation) {
          loadNearbyStores(userLocation[0], userLocation[1], userNeighborhood);
        }
      } else {
        setError(response.message || 'خطا در ثبت مغازه');
      }
    } catch (err: any) {
      setError(err.message || 'خطا در ثبت مغازه. لطفاً مطمئن شوید که وارد سیستم شده‌اید.');
    } finally {
      setSubmitting(false);
    }
  };

  const mapCenter: [number, number] = userLocation || [35.6892, 51.3890];

  // Load store comments
  const loadStoreComments = async (storeId: number) => {
    setLoadingComments(true);
    try {
      const response = await storeCommentsAPI.getComments(storeId);
      if (response.success) {
        setStoreComments(response.comments || []);
      }
    } catch (error) {
      // Silent error
    } finally {
      setLoadingComments(false);
    }
  };

  // Handle comment image upload
  const handleCommentImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles = Array.from(files);
    setCommentImages([...commentImages, ...newFiles]);

    // Upload images and get URLs
    for (const file of newFiles) {
      try {
        const response = await storeCommentsAPI.uploadImage(file);
        if (response.success) {
          const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
          setCommentImageUrls([...commentImageUrls, `${baseURL}${response.url}`]);
        }
      } catch (error) {
        // Silent error
      }
    }
  };

  // Remove comment image
  const removeCommentImage = (index: number) => {
    const newImages = commentImages.filter((_, i) => i !== index);
    const newUrls = commentImageUrls.filter((_, i) => i !== index);
    setCommentImages(newImages);
    setCommentImageUrls(newUrls);
  };

  // Submit comment
  const submitComment = async () => {
    if (!selectedStoreForPanel || !commentText.trim()) {
      setError('لطفاً نظر خود را وارد کنید');
      return;
    }

    if (!user) {
      setError('لطفاً ابتدا وارد سیستم شوید');
      return;
    }

    setSubmittingComment(true);
    try {
      const response = await storeCommentsAPI.createComment({
        storeId: selectedStoreForPanel.id,
        comment: commentText,
        rating: commentRating,
        userLat: userLocation?.[0],
        userLng: userLocation?.[1],
        imageUrls: commentImageUrls,
      });

      if (response.success) {
        setCommentText('');
        setCommentRating(5);
        setCommentImages([]);
        setCommentImageUrls([]);
        setShowStorePanel(false);
        setSelectedStoreForPanel(null);
        await loadStoreComments(selectedStoreForPanel.id);
        if (userLocation) {
          loadNearbyStores(userLocation[0], userLocation[1], userNeighborhood);
        }
      } else {
        setError(response.message || 'خطا در ثبت نظر');
      }
    } catch (err: any) {
      setError(err.message || 'خطا در ثبت نظر');
    } finally {
      setSubmittingComment(false);
    }
  };

  // Update user location
  const handleUpdateLocation = async () => {
    if (!userLocation) return;
    
    try {
      await userLocationAPI.updateLocation(userLocation[0], userLocation[1]);
      // Get new neighborhood
      const neighborhood = await getUserNeighborhood(userLocation[0], userLocation[1]);
      setUserNeighborhood(neighborhood);
      await loadNearbyStores(userLocation[0], userLocation[1], neighborhood);
    } catch (error) {
      // Silent error
    }
  };

  // Load stores by neighborhood
  const [neighborhoodStoresTotalCount, setNeighborhoodStoresTotalCount] = useState<number | null>(null);

  // Handle login
  const handleLogin = async () => {
    if (!loginUsername.trim() || !loginPassword.trim()) {
      setError('لطفاً نام کاربری و رمز عبور را وارد کنید');
      return;
    }

    setLoggingIn(true);
    setError(null);
    try {
      const response = await authAPI.login({ 
        username: loginUsername.trim(), 
        password: loginPassword 
      });
      
      if (response.success && response.user) {
        setUser(response.user);
        setShowLoginModal(false);
        setLoginUsername('');
        setLoginPassword('');
        setError(null);
        // Reload stores after login
        if (userLocation) {
          loadNearbyStores(userLocation[0], userLocation[1], userNeighborhood);
        }
      } else {
        setError(response.message || 'نام کاربری یا رمز عبور اشتباه است');
      }
    } catch (err: any) {
      // اگر خطای HTTP است (مثل 401)، پیام اصلی را نمایش بده
      // اگر خطای شبکه است، پیام عمومی را نمایش بده
      if (err.isHttpError) {
        // برای خطای 401، پیام مناسب‌تری نمایش بده
        if (err.statusCode === 401) {
          setError('نام کاربری یا رمز عبور اشتباه است');
        } else {
          setError(err.message || 'خطا در ورود. لطفاً دوباره تلاش کنید.');
        }
      } else {
        setError(err.message || 'خطا در ورود. لطفاً دوباره تلاش کنید.');
      }
    } finally {
      setLoggingIn(false);
    }
  };

  // Update workshop status
  const updateWorkshopStatus = async (storeId: number, hasWorkshop: boolean) => {
    if (!user) {
      setError('لطفاً ابتدا وارد سیستم شوید');
      return;
    }

    try {
      const response = await storeWorkshopAPI.updateWorkshopStatus({
        storeId,
        hasWorkshop,
      });

      if (response.success) {
        // به‌روزرسانی وضعیت در لیست
        setStores(prevStores =>
          prevStores.map(store =>
            store.id === storeId ? { ...store, hasWorkshop } : store
          )
        );
        // به‌روزرسانی در neighborhood stores هم
        setNeighborhoodStores(prevStores =>
          prevStores.map(store =>
            store.id === storeId ? { ...store, hasWorkshop } : store
          )
        );
      } else {
        setError(response.message || 'خطا در به‌روزرسانی وضعیت کارگاه');
      }
    } catch (err: any) {
      setError(err.message || 'خطا در به‌روزرسانی وضعیت کارگاه');
    }
  };

  // Submit deactivation request
  const submitDeactivationRequest = async () => {
    if (!selectedStoreForDeactivation || !user) {
      setError('لطفاً ابتدا وارد سیستم شوید');
      return;
    }

    setSubmittingDeactivation(true);
    setError(null);
    try {
      const response = await storeDeactivationAPI.createRequest({
        storeId: selectedStoreForDeactivation.id,
        reason: deactivationReason.trim() || undefined,
      });

      if (response.success) {
        setShowDeactivationModal(false);
        setSelectedStoreForDeactivation(null);
        setDeactivationReason('');
        // Show success message
        alert('درخواست غیرفعال کردن مغازه با موفقیت ثبت شد. در انتظار تایید مدیر...');
      } else {
        setError(response.message || 'خطا در ثبت درخواست');
      }
    } catch (err: any) {
      setError(err.message || 'خطا در ثبت درخواست. لطفاً دوباره تلاش کنید.');
    } finally {
      setSubmittingDeactivation(false);
    }
  };

  const loadNeighborhoodStores = async () => {
    if (!userNeighborhood || !userLocation) {
      setError('لطفاً ابتدا موقعیت خود را مشخص کنید');
      return;
    }

    setLoadingNeighborhoodStores(true);
    setError(null);
    try {
      const response = await nearbyStoresAPI.getStoresByNeighborhood({
        neighborhood: userNeighborhood,
        lat: userLocation[0],
        lng: userLocation[1],
        limit: 30,
      });

      if (response.success) {
        
        // ذخیره تعداد کل
        if (response.totalCount !== undefined) {
          setNeighborhoodStoresTotalCount(response.totalCount);
        }
        
        // Map API response to Store interface
        const mappedStores = (response.stores || []).map((store: any) => ({
          id: store.id,
          name: store.name,
          address: store.address || '',
          latitude: store.lat || store.latitude,
          longitude: store.lng || store.longitude,
          category: store.category || 'نامشخص',
          categorySlug: store.categorySlug,
          distance: store.distance,
          phone: store.phone,
          rating: store.rating,
          ratingCount: store.ratingCount,
          description: store.description,
          website: store.website,
          email: store.email,
          priceRange: store.priceRange,
          hasWorkshop: store.has_workshop || store.hasWorkshop || false,
        }));
        
        setNeighborhoodStores(mappedStores);
        setShowNeighborhoodStores(true);
        // به‌روزرسانی لیست مغازه‌ها با مشتریان محله
        setStores(mappedStores);
      } else {
        setError('خطا در دریافت مشتریان محله');
      }
    } catch (err: any) {
      setError(err.message || 'خطا در دریافت مشتریان محله');
    } finally {
      setLoadingNeighborhoodStores(false);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh', 
      fontFamily: "'Vazirmatn', 'Tahoma', 'Arial', sans-serif",
      position: 'relative'
    }}>

      {/* Header - Show on desktop, hide on mobile when list is shown, hide when map is full-screen */}
      {(!isMobile || !showList) && !isMapFullScreen && (
      <div style={{ 
        padding: isMobile ? '10px' : '12px 20px', 
        backgroundColor: '#f5f5f5', 
        borderBottom: '1px solid #ddd',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '10px' : '15px', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* ردیف اول: نام کاربر و دکمه‌های ورود/خروج */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', flex: isMobile ? '1' : '0 1 auto' }}>
            <h1 style={{ margin: 0, color: '#1976D2', fontSize: isMobile ? '18px' : '24px' }}>
              📊 مارکت ویزیت
              {userNeighborhood && (
                <span style={{ fontSize: isMobile ? '14px' : '18px', color: '#666', marginRight: '10px' }}>
                  ({userNeighborhood})
                </span>
              )}
            </h1>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* نام کاربر و دکمه خروج / دکمه ورود */}
              {user ? (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '10px',
                padding: isMobile ? '6px 12px' : '8px 16px',
                backgroundColor: '#e3f2fd',
                borderRadius: '20px',
                fontSize: isMobile ? '12px' : '14px'
              }}>
                <span style={{ color: '#1976D2', fontWeight: 500 }}>
                  👤 {user.fullName || user.username || 'کاربر'}
                </span>
                <button
                  onClick={async () => {
                    try {
                      await authAPI.logout();
                      setUser(null);
                      window.location.reload();
                    } catch (error) {
                      setUser(null);
                      window.location.reload();
                    }
                  }}
                  style={{
                    padding: isMobile ? '4px 10px' : '8px 16px',
                    backgroundColor: '#f44336',
                    color: 'white',
                    border: 'none',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    fontSize: isMobile ? '11px' : '14px',
                    fontWeight: 600,
                    boxShadow: '0 2px 6px rgba(244, 67, 54, 0.3)',
                    transition: 'all 0.3s ease',
                    touchAction: 'manipulation'
                  }}
                  onMouseEnter={(e) => {
                    if (!isMobile) {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 4px 10px rgba(244, 67, 54, 0.4)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isMobile) {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 2px 6px rgba(244, 67, 54, 0.3)';
                    }
                  }}
                  title="خروج از حساب کاربری"
                >
                  🚪 خروج
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setShowLoginModal(true);
                  setLoginUsername('');
                  setLoginPassword('');
                }}
                style={{
                  padding: isMobile ? '6px 12px' : '10px 20px',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  fontSize: isMobile ? '12px' : '15px',
                  fontWeight: 600,
                  boxShadow: '0 2px 6px rgba(76, 175, 80, 0.3)',
                  transition: 'all 0.3s ease',
                  touchAction: 'manipulation'
                }}
                onMouseEnter={(e) => {
                  if (!isMobile) {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 4px 10px rgba(76, 175, 80, 0.4)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isMobile) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 6px rgba(76, 175, 80, 0.3)';
                  }
                }}
                title="ورود به حساب کاربری"
              >
                🔐 ورود
              </button>
              )}
            </div>
          </div>
          
          {/* ردیف دوم: دکمه‌های دیگر */}
          {!isMobile && (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', flex: '0 1 auto' }}>
              <button
                onClick={() => {
                  if (isMapFullScreen) {
                    setIsMapFullScreen(false);
                  } else {
                    setIsMapFullScreen(true);
                  }
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: isMapFullScreen ? '#FF9800' : '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontFamily: "'Vazirmatn', 'Tahoma', 'Arial', sans-serif",
                  fontSize: '15px',
                  fontWeight: 600,
                  minHeight: '42px',
                  boxShadow: isMapFullScreen 
                    ? '0 4px 12px rgba(255, 152, 0, 0.3)' 
                    : '0 4px 12px rgba(33, 150, 243, 0.3)',
                  transition: 'all 0.3s ease',
                  touchAction: 'manipulation'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = isMapFullScreen 
                    ? '0 6px 16px rgba(255, 152, 0, 0.4)' 
                    : '0 6px 16px rgba(33, 150, 243, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = isMapFullScreen 
                    ? '0 4px 12px rgba(255, 152, 0, 0.3)' 
                    : '0 4px 12px rgba(33, 150, 243, 0.3)';
                }}
                title={isMapFullScreen ? 'بازگشت به حالت عادی' : 'نقشه تمام صفحه'}
              >
                {isMapFullScreen ? '⤓ تمام صفحه' : '🗺️ تمام صفحه'}
              </button>
              <button
                onClick={() => handleAddStore()}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontFamily: "'Vazirmatn', 'Tahoma', 'Arial', sans-serif",
                  fontSize: '15px',
                  fontWeight: 600,
                  minHeight: '42px',
                  boxShadow: '0 4px 12px rgba(76, 175, 80, 0.3)',
                  transition: 'all 0.3s ease',
                  touchAction: 'manipulation'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(76, 175, 80, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(76, 175, 80, 0.3)';
                }}
              >
                ➕ ثبت مغازه جدید
              </button>
            </div>
          )}
        </div>
        {/* بخش نمایش مشتریان محله - برای دسکتاپ و موبایل */}
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
          {userNeighborhood && userNeighborhood.trim().length > 0 ? (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px',
              flexWrap: 'wrap',
              width: isMobile ? '100%' : 'auto'
            }}>
              <div style={{ flex: 1 }}>
                <p style={{ 
                  margin: 0, 
                  fontSize: isMobile ? '14px' : '16px', 
                  color: '#1976D2', 
                  fontWeight: 600
                }}>
                  🏘️ محله شما: {userNeighborhood}
                </p>
                {showNeighborhoodStores && neighborhoodStoresTotalCount !== null && neighborhoodStoresTotalCount > 30 && (
                  <p style={{ 
                    margin: '5px 0 0 0', 
                    fontSize: isMobile ? '12px' : '13px', 
                    color: '#666',
                    fontStyle: 'italic'
                  }}>
                    ℹ️ تعداد کل مغازه‌های این محله: {neighborhoodStoresTotalCount} (نمایش {neighborhoodStores.length} تا از نزدیک‌ترین‌ها)
                  </p>
                )}
                {showNeighborhoodStores && neighborhoodStoresTotalCount !== null && neighborhoodStoresTotalCount <= 30 && (
                  <p style={{ 
                    margin: '5px 0 0 0', 
                    fontSize: isMobile ? '12px' : '13px', 
                    color: '#666',
                    fontStyle: 'italic'
                  }}>
                    ℹ️ تعداد کل مغازه‌های این محله: {neighborhoodStoresTotalCount}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  if (showNeighborhoodStores) {
                    // اگر در حال نمایش است، پنهان کن و لیست مغازه‌ها را به حالت قبلی برگردان
                    setShowNeighborhoodStores(false);
                    setNeighborhoodStores([]);
                    // به‌روزرسانی لیست مغازه‌ها با مغازه‌های نزدیک
                    if (userLocation) {
                      loadNearbyStores(userLocation[0], userLocation[1], useNeighborhoodFilter ? userNeighborhood : null);
                    }
                  } else {
                    // اگر پنهان است، نمایش بده
                    if (userLocation && userNeighborhood) {
                      loadNeighborhoodStores();
                    }
                  }
                }}
                disabled={loadingNeighborhoodStores}
                style={{
                  width: isMobile ? '45px' : '50px',
                  height: isMobile ? '45px' : '50px',
                  borderRadius: '50%',
                  backgroundColor: showNeighborhoodStores ? '#4CAF50' : '#2196F3',
                  color: 'white',
                  border: 'none',
                  cursor: loadingNeighborhoodStores ? 'not-allowed' : 'pointer',
                  fontSize: isMobile ? '20px' : '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  transition: 'all 0.3s',
                  opacity: loadingNeighborhoodStores ? 0.6 : 1,
                  touchAction: 'manipulation',
                  flexShrink: 0
                }}
                title={showNeighborhoodStores ? 'پنهان کردن مشتریان محله' : 'نمایش مشتریان این محله'}
              >
                {loadingNeighborhoodStores ? '⏳' : showNeighborhoodStores ? '✅' : '👥'}
              </button>
            </div>
          ) : userLocation ? (
            <p style={{ margin: 0, fontSize: isMobile ? '12px' : '14px', color: '#666' }}>
              📍 موقعیت شما: {userLocation[0].toFixed(6)}, {userLocation[1].toFixed(6)}
            </p>
          ) : null}
          {userNeighborhood && (
            <div style={{ 
              padding: '8px 12px', 
              backgroundColor: '#e3f2fd', 
              borderRadius: '4px',
              fontSize: isMobile ? '11px' : '12px',
              color: '#1976D2',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              width: isMobile ? '100%' : 'auto'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <span>
                  ℹ️ {useNeighborhoodFilter ? (
                    <>فقط مغازه‌های محله <strong>{userNeighborhood}</strong> نمایش داده می‌شوند</>
                  ) : (
                    'فیلتر محله غیرفعال است'
                  )}
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '11px' }}>
                  <input
                    type="checkbox"
                    checked={useNeighborhoodFilter}
                    onChange={(e) => {
                      setUseNeighborhoodFilter(e.target.checked);
                      if (userLocation) {
                        loadNearbyStores(userLocation[0], userLocation[1], e.target.checked ? userNeighborhood : null);
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                  فیلتر محله
                </label>
              </div>
              <button
                onClick={loadNeighborhoodStores}
                disabled={loadingNeighborhoodStores}
                style={{
                  padding: '8px 12px',
                  backgroundColor: showNeighborhoodStores ? '#4CAF50' : '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loadingNeighborhoodStores ? 'not-allowed' : 'pointer',
                  fontSize: isMobile ? '12px' : '13px',
                  fontWeight: 500,
                  width: '100%',
                  opacity: loadingNeighborhoodStores ? 0.6 : 1
                }}
              >
                {loadingNeighborhoodStores 
                  ? '⏳ در حال بارگذاری...' 
                  : showNeighborhoodStores 
                    ? `✅ نمایش مشتریان محله ${userNeighborhood} (${neighborhoodStores.length})`
                    : `👥 نمایش تمام مشتریان محله ${userNeighborhood}`
                }
              </button>
              {showNeighborhoodStores && (
                <button
                  onClick={() => {
                    setShowNeighborhoodStores(false);
                    setNeighborhoodStores([]);
                    // به‌روزرسانی لیست مغازه‌ها با مغازه‌های نزدیک
                    if (userLocation) {
                      loadNearbyStores(userLocation[0], userLocation[1], useNeighborhoodFilter ? userNeighborhood : null);
                    }
                  }}
                  style={{
                    padding: '6px 10px',
                    backgroundColor: '#f44336',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    width: '100%'
                  }}
                >
                  ✕ پنهان کردن مشتریان محله
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {error && (
        <div style={{
          padding: '15px',
          margin: '15px',
          backgroundColor: '#ffebee',
          color: '#c62828',
          borderRadius: '4px',
          border: '1px solid #ef5350'
        }}>
          {error}
        </div>
      )}

      {/* Mobile Bottom Navigation - Hide when map is full-screen */}
      {isMobile && !isMapFullScreen && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1001,
          display: 'flex',
          gap: '15px',
          backgroundColor: 'white',
          borderRadius: '50px',
          padding: '8px 15px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          alignItems: 'center'
        }}>
          <button
            onClick={() => {
              if (isMapFullScreen) {
                // اگر full-screen است، به حالت عادی برگرد
                setIsMapFullScreen(false);
                setShowList(false);
              } else {
                // اگر full-screen نیست، full-screen کن
                setIsMapFullScreen(true);
                setShowList(false);
                setShowMap(true);
              }
            }}
            style={{
              width: '50px',
              height: '50px',
              borderRadius: '50%',
              backgroundColor: isMapFullScreen ? '#FF9800' : (showMap && !showList ? '#2196F3' : '#f5f5f5'),
              color: isMapFullScreen ? 'white' : (showMap && !showList ? 'white' : '#666'),
              border: 'none',
              cursor: 'pointer',
              fontSize: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isMapFullScreen ? '0 2px 8px rgba(255, 152, 0, 0.4)' : (showMap && !showList ? '0 2px 8px rgba(33, 150, 243, 0.4)' : 'none'),
              transition: 'all 0.3s',
              touchAction: 'manipulation'
            }}
            title={isMapFullScreen ? 'بازگشت به حالت عادی' : 'نقشه'}
          >
            {isMapFullScreen ? '⤓' : '🗺️'}
          </button>
          <button
            onClick={() => {
              setShowList(true);
              setShowMap(true);
            }}
            style={{
              width: '50px',
              height: '50px',
              borderRadius: '50%',
              backgroundColor: showList ? '#4CAF50' : '#f5f5f5',
              color: showList ? 'white' : '#666',
              border: 'none',
              cursor: 'pointer',
              fontSize: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: showList ? '0 2px 8px rgba(76, 175, 80, 0.4)' : 'none',
              transition: 'all 0.3s',
              touchAction: 'manipulation'
            }}
            title="لیست"
          >
            📋
          </button>
          <button
            onClick={() => handleAddStore()}
            style={{
              width: '50px',
              height: '50px',
              borderRadius: '50%',
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              fontSize: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(76, 175, 80, 0.4)',
              transition: 'all 0.3s',
              touchAction: 'manipulation'
            }}
            title="ثبت مغازه جدید"
          >
            ➕
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <p>در حال بارگذاری...</p>
        </div>
      ) : (
        <div style={{ 
          display: 'flex', 
          flex: 1, 
          overflow: 'hidden',
          flexDirection: isMobile ? 'column' : 'row',
          position: 'relative'
        }}>
          {/* Store List - Hide when map is full-screen */}
          {!isMapFullScreen && (
          <div style={{
            width: isMobile ? '100%' : '350px',
            maxWidth: isMobile ? '100%' : '350px',
            backgroundColor: '#f5f5f5',
            padding: isMobile ? '15px' : '20px',
            overflowY: 'auto',
            borderLeft: isMobile ? 'none' : '1px solid #ddd',
            borderBottom: isMobile ? '1px solid #ddd' : 'none',
            display: isMobile ? (showList ? 'block' : 'none') : 'block',
            position: isMobile ? 'fixed' : 'relative',
            bottom: isMobile ? (showList ? '0' : '-100%') : 'auto',
            top: isMobile ? 'auto' : 0,
            right: isMobile ? 0 : 'auto',
            left: isMobile ? 0 : 'auto',
            height: isMobile ? '60vh' : 'auto',
            maxHeight: isMobile ? '60vh' : 'none',
            zIndex: isMobile ? 1000 : 'auto',
            transition: 'bottom 0.3s ease-in-out',
            boxShadow: isMobile ? '0 -2px 8px rgba(0,0,0,0.2)' : 'none',
            borderRadius: isMobile ? '20px 20px 0 0' : '0'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '15px',
              paddingBottom: '10px',
              borderBottom: '2px solid #ddd'
            }}>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: isMobile ? '16px' : '18px' }}>
                  📋 لیست مغازه‌ها ({stores.length})
                  {userNeighborhood && (
                    <span style={{ fontSize: isMobile ? '12px' : '14px', color: '#666', marginRight: '5px' }}>
                      - محله {userNeighborhood}
                    </span>
                  )}
                </h3>
                {/* شعاع جستجو با دکمه‌های + و - */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  marginTop: '8px',
                  flexWrap: 'wrap'
                }}>
                  <span style={{ fontSize: isMobile ? '12px' : '13px', color: '#666' }}>
                    شعاع جستجو:
                  </span>
                  <button
                    onClick={() => {
                      if (maxDistance > 50) {
                        setMaxDistance(maxDistance - 50);
                      }
                    }}
                    disabled={maxDistance <= 50}
                    style={{
                      width: isMobile ? '32px' : '36px',
                      height: isMobile ? '32px' : '36px',
                      borderRadius: '50%',
                      backgroundColor: maxDistance <= 50 ? '#ccc' : '#f44336',
                      color: 'white',
                      border: 'none',
                      cursor: maxDistance <= 50 ? 'not-allowed' : 'pointer',
                      fontSize: isMobile ? '18px' : '20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: maxDistance <= 50 ? 'none' : '0 2px 4px rgba(0,0,0,0.2)',
                      transition: 'all 0.2s',
                      touchAction: 'manipulation',
                      opacity: maxDistance <= 50 ? 0.5 : 1
                    }}
                    title="کاهش 50 متری"
                  >
                    −
                  </button>
                  <span style={{ 
                    fontSize: isMobile ? '13px' : '14px', 
                    color: '#1976D2', 
                    fontWeight: 600,
                    minWidth: '60px',
                    textAlign: 'center'
                  }}>
                    {maxDistance} متر
                  </span>
                  <button
                    onClick={() => {
                      if (maxDistance < 2000) {
                        setMaxDistance(maxDistance + 50);
                      }
                    }}
                    disabled={maxDistance >= 2000}
                    style={{
                      width: isMobile ? '32px' : '36px',
                      height: isMobile ? '32px' : '36px',
                      borderRadius: '50%',
                      backgroundColor: maxDistance >= 2000 ? '#ccc' : '#4CAF50',
                      color: 'white',
                      border: 'none',
                      cursor: maxDistance >= 2000 ? 'not-allowed' : 'pointer',
                      fontSize: isMobile ? '18px' : '20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: maxDistance >= 2000 ? 'none' : '0 2px 4px rgba(0,0,0,0.2)',
                      transition: 'all 0.2s',
                      touchAction: 'manipulation',
                      opacity: maxDistance >= 2000 ? 0.5 : 1
                    }}
                    title="افزایش 50 متری"
                  >
                    +
                  </button>
                </div>
                {showNeighborhoodStores && neighborhoodStoresTotalCount !== null && neighborhoodStoresTotalCount > 30 && (
                  <p style={{ 
                    margin: '5px 0 0 0', 
                    fontSize: isMobile ? '11px' : '12px', 
                    color: '#666',
                    fontStyle: 'italic'
                  }}>
                    ℹ️ تعداد کل مغازه‌های این محله: {neighborhoodStoresTotalCount} (نمایش {neighborhoodStores.length} تا از نزدیک‌ترین‌ها)
                  </p>
                )}
                {showNeighborhoodStores && neighborhoodStoresTotalCount !== null && neighborhoodStoresTotalCount <= 30 && (
                  <p style={{ 
                    margin: '5px 0 0 0', 
                    fontSize: isMobile ? '11px' : '12px', 
                    color: '#666',
                    fontStyle: 'italic'
                  }}>
                    ℹ️ تعداد کل مغازه‌های این محله: {neighborhoodStoresTotalCount}
                  </p>
                )}
              </div>
              {isMobile && (
                <button
                  onClick={() => setShowList(false)}
                  style={{
                    width: '35px',
                    height: '35px',
                    borderRadius: '50%',
                    backgroundColor: '#f44336',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    touchAction: 'manipulation'
                  }}
                >
                  ✕
                </button>
              )}
            </div>
            
            {stores.length === 0 && !loading ? (
              <div style={{ 
                textAlign: 'center', 
                marginTop: '40px',
                padding: '20px'
              }}>
                <p style={{ color: '#666', fontSize: '16px', marginBottom: '10px' }}>
                  📭 هیچ مغازه‌ای یافت نشد
                </p>
                <p style={{ color: '#999', fontSize: '12px' }}>
                  {userNeighborhood && useNeighborhoodFilter 
                    ? `در محله ${userNeighborhood} و شعاع ${maxDistance} متری مغازه‌ای یافت نشد`
                    : `در شعاع ${maxDistance} متری مغازه‌ای یافت نشد`
                  }
                </p>
              </div>
            ) : stores.length > 0 ? (
              stores.map(store => (
                <div
                  key={store.id}
                  onClick={() => {
                    setSelectedStore(store);
                    if (isMobile) {
                      setShowList(false);
                      setShowMap(true);
                    }
                  }}
                  style={{
                    padding: isMobile ? '12px' : '15px',
                    marginBottom: '10px',
                    backgroundColor: selectedStore?.id === store.id ? '#e3f2fd' : 'white',
                    borderRadius: isMobile ? '15px' : '8px',
                    border: `2px solid ${selectedStore?.id === store.id ? '#2196F3' : '#e0e0e0'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                    touchAction: 'manipulation'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '24px', marginLeft: '8px' }}>
                      {getCategoryIconForStore(store)}
                    </span>
                    <h4 style={{ margin: 0, color: '#1976D2', fontWeight: 600, fontSize: isMobile ? '14px' : '16px' }}>
                      {store.name}
                    </h4>
                  </div>
                  <p style={{ margin: '5px 0', fontSize: isMobile ? '12px' : '13px', color: '#616161' }}>
                    {store.address}
                  </p>
                  {store.distance && (
                    <p style={{ margin: '5px 0', fontSize: isMobile ? '11px' : '12px', color: '#666' }}>
                      📏 فاصله: {store.distance.toFixed(0)} متر
                    </p>
                  )}
                  <div style={{ margin: '5px 0', fontSize: isMobile ? '11px' : '12px', color: '#666' }}>
                    {store.phone && (
                      <span style={{ display: 'block', marginBottom: '3px' }}>
                        📞 {store.phone}
                      </span>
                    )}
                    {store.rating != null && (
                      <span style={{ display: 'block', marginBottom: '3px' }}>
                        ⭐ {store.rating.toFixed(1)} {store.ratingCount ? `(${store.ratingCount} نظر)` : ''}
                      </span>
                    )}
                    {store.priceRange && (
                      <span style={{ display: 'block', marginBottom: '3px' }}>
                        💰 {store.priceRange}
                      </span>
                    )}
                  </div>
                  {/* Workshop Checkbox */}
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    marginTop: '10px',
                    marginBottom: '8px'
                  }}>
                    <label style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px',
                      cursor: user ? 'pointer' : 'not-allowed',
                      fontSize: isMobile ? '12px' : '13px',
                      color: user ? '#333' : '#999',
                      userSelect: 'none'
                    }}>
                      <input
                        type="checkbox"
                        checked={store.hasWorkshop || false}
                        onChange={(e) => {
                          e.stopPropagation();
                          if (user) {
                            updateWorkshopStatus(store.id, e.target.checked);
                          } else {
                            setShowLoginModal(true);
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        disabled={!user}
                        style={{
                          width: isMobile ? '18px' : '20px',
                          height: isMobile ? '18px' : '20px',
                          cursor: user ? 'pointer' : 'not-allowed',
                          accentColor: '#4CAF50'
                        }}
                      />
                      <span>🔧 کارگاه دارد</span>
                    </label>
                  </div>
                  {/* Action Buttons */}
                  <div style={{ 
                    display: 'flex', 
                    gap: '8px', 
                    marginTop: '10px',
                    flexWrap: 'wrap'
                  }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!user) {
                          setShowLoginModal(true);
                          return;
                        }
                        setSelectedStoreForPanel(store);
                        setShowStorePanel(true);
                        loadStoreComments(store.id);
                      }}
                      style={{
                        flex: 1,
                        minWidth: '120px',
                        padding: isMobile ? '8px 12px' : '10px 16px',
                        backgroundColor: '#2196F3',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: isMobile ? '12px' : '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        touchAction: 'manipulation'
                      }}
                      onMouseDown={(e) => {
                        e.currentTarget.style.transform = 'translateY(1px)';
                        e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
                      }}
                      onMouseUp={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                      }}
                    >
                      📝 ثبت نظر
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!user) {
                          setShowLoginModal(true);
                          return;
                        }
                        setSelectedStoreForDeactivation(store);
                        setShowDeactivationModal(true);
                      }}
                      style={{
                        flex: 1,
                        minWidth: '120px',
                        padding: isMobile ? '8px 12px' : '10px 16px',
                        backgroundColor: '#f44336',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: isMobile ? '12px' : '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        touchAction: 'manipulation'
                      }}
                      onMouseDown={(e) => {
                        e.currentTarget.style.transform = 'translateY(1px)';
                        e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
                      }}
                      onMouseUp={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                      }}
                    >
                      🚫 غیرفعال کردن
                    </button>
                  </div>
                </div>
              ))
            ) : null}
          </div>
          )}

          {/* Map - Desktop */}
          {!isMobile && (
          <div style={{ 
            flex: 1, 
            position: isMapFullScreen ? 'fixed' : 'relative',
            top: isMapFullScreen ? 0 : 'auto',
            left: isMapFullScreen ? 0 : 'auto',
            right: isMapFullScreen ? 0 : 'auto',
            bottom: isMapFullScreen ? 0 : 'auto',
            display: 'block',
            height: isMapFullScreen ? '100vh' : '100%',
            minHeight: 0,
            width: '100%',
            zIndex: isMapFullScreen ? 9999 : 'auto',
            overflow: 'hidden',
            transition: 'all 0.3s ease-in-out'
          }}>
            {/* دکمه خروج از حالت Full-Screen */}
            {isMapFullScreen && (
              <button
                onClick={() => setIsMapFullScreen(false)}
                style={{
                  position: 'absolute',
                  top: isMobile ? '15px' : '20px',
                  right: isMobile ? '15px' : '20px',
                  zIndex: 10000,
                  width: isMobile ? '45px' : '50px',
                  height: isMobile ? '45px' : '50px',
                  borderRadius: '50%',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: isMobile ? '20px' : '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                  transition: 'all 0.3s',
                  touchAction: 'manipulation'
                }}
                title="بازگشت به حالت عادی"
              >
                ✕
              </button>
            )}
            {mapCenter && !loading ? (
              <MapContainer
                center={mapCenter}
                zoom={isMobile ? 15 : 13}
                style={{ height: '100%', width: '100%' }}
                key={`map-${mapCenter[0]}-${mapCenter[1]}`}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapCenter center={mapCenter} zoom={isMobile ? 15 : 13} />
                <MapEventHandler onLongPress={(lat, lng) => handleAddStore(lat, lng)} />
                
                {/* Search radius circle */}
                {userLocation && 
                 Array.isArray(userLocation) && 
                 userLocation.length === 2 &&
                 typeof userLocation[0] === 'number' && 
                 typeof userLocation[1] === 'number' &&
                 !isNaN(userLocation[0]) && 
                 !isNaN(userLocation[1]) && (
                  <Circle
                    center={userLocation}
                    radius={maxDistance}
                    pathOptions={{ color: 'blue', fillColor: 'blue', fillOpacity: 0.1 }}
                  />
                )}
                
                {/* User location marker */}
                {userLocation && 
                 Array.isArray(userLocation) && 
                 userLocation.length === 2 &&
                 typeof userLocation[0] === 'number' && 
                 typeof userLocation[1] === 'number' &&
                 !isNaN(userLocation[0]) && 
                 !isNaN(userLocation[1]) &&
                 userLocation[0] >= -90 && 
                 userLocation[0] <= 90 &&
                 userLocation[1] >= -180 && 
                 userLocation[1] <= 180 && (
                  <Marker position={userLocation} icon={L.icon({
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                  })}>
                    <Popup>📍 موقعیت شما</Popup>
                  </Marker>
                )}
                
                {/* Store markers */}
                {(() => {
                  const validStores = stores.filter(store => {
                    const hasValidCoords = store.latitude != null && 
                      store.longitude != null && 
                      !isNaN(store.latitude) && 
                      !isNaN(store.longitude) &&
                      store.latitude >= -90 && 
                      store.latitude <= 90 &&
                      store.longitude >= -180 && 
                      store.longitude <= 180;
                    
                    if (!hasValidCoords) {
                    }
                    return hasValidCoords;
                  });
                  
                  
                  return validStores.map(store => (
                  <Marker
                    key={store.id}
                    position={[store.latitude, store.longitude]}
                    icon={createCustomIcon(store)}
                  >
                    <Popup>
                      <div style={{ fontFamily: "'Vazirmatn', 'Tahoma', 'Arial', sans-serif", minWidth: '200px', maxWidth: '300px' }}>
                        <h4 style={{ margin: '5px 0', color: '#1976D2', fontWeight: 600 }}>
                          {getCategoryIconForStore(store)} {store.name}
                        </h4>
                        <p style={{ margin: '5px 0', fontSize: '13px', color: '#424242' }}>
                          {store.address}
                        </p>
                        {store.distance && (
                          <p style={{ margin: '5px 0', fontSize: '13px', color: '#424242' }}>
                            📏 فاصله: {store.distance.toFixed(0)} متر
                          </p>
                        )}
                        {store.phone && (
                          <p style={{ margin: '5px 0', fontSize: '13px', color: '#424242' }}>
                            📞 {store.phone}
                          </p>
                        )}
                        {store.rating != null && (
                          <p style={{ margin: '5px 0', fontSize: '13px', color: '#424242' }}>
                            ⭐ {store.rating.toFixed(1)} {store.ratingCount ? `(${store.ratingCount} نظر)` : ''}
                          </p>
                        )}
                        {user && (
                          <div style={{ marginTop: '10px', display: 'flex', gap: '5px', flexDirection: 'column' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedStoreForPanel(store);
                                setShowStorePanel(true);
                                loadStoreComments(store.id);
                              }}
                              style={{
                                padding: '8px 12px',
                                backgroundColor: '#2196F3',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                width: '100%'
                              }}
                            >
                              💬 ثبت نظر و عکس
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedStoreForDeactivation(store);
                                setShowDeactivationModal(true);
                              }}
                              style={{
                                padding: '8px 12px',
                                backgroundColor: '#f44336',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                width: '100%'
                              }}
                            >
                              🚫 درخواست غیرفعال کردن
                            </button>
                          </div>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                  ));
                })()}
                
                {/* Neighborhood stores markers (different color) */}
                {showNeighborhoodStores && neighborhoodStores.length > 0 && (() => {
                  const validNeighborhoodStores = neighborhoodStores.filter(store => {
                    const hasValidCoords = store.latitude != null && 
                      store.longitude != null && 
                      !isNaN(store.latitude) && 
                      !isNaN(store.longitude) &&
                      store.latitude >= -90 && 
                      store.latitude <= 90 &&
                      store.longitude >= -180 && 
                      store.longitude <= 180;
                    return hasValidCoords;
                  });
                  
                  
                  return validNeighborhoodStores.map(store => (
                    <Marker
                      key={`neighborhood-${store.id}`}
                      position={[store.latitude, store.longitude]}
                      icon={L.divIcon({
                        className: 'custom-marker-neighborhood',
                        html: `<div style="
                          background-color: #4CAF50;
                          width: 35px;
                          height: 35px;
                          border-radius: 50%;
                          border: 3px solid white;
                          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                          display: flex;
                          align-items: center;
                          justify-content: center;
                          font-size: 18px;
                          line-height: 1;
                          text-align: center;
                          font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
                        ">${getCategoryIconForStore(store)}</div>`,
                        iconSize: [35, 35],
                        iconAnchor: [17, 17],
                        popupAnchor: [0, -17],
                      })}
                    >
                      <Popup>
                        <div style={{ fontFamily: "'Vazirmatn', 'Tahoma', 'Arial', sans-serif", minWidth: '200px', maxWidth: '300px' }}>
                          <div style={{ 
                            padding: '4px 8px', 
                            backgroundColor: '#4CAF50', 
                            color: 'white', 
                            borderRadius: '4px', 
                            fontSize: '10px', 
                            marginBottom: '5px',
                            display: 'inline-block'
                          }}>
                            محله {userNeighborhood}
                          </div>
                          <h4 style={{ margin: '5px 0', color: '#1976D2', fontWeight: 600 }}>
                            {getCategoryIconForStore(store)} {store.name}
                          </h4>
                          <p style={{ margin: '5px 0', fontSize: '13px', color: '#424242' }}>
                            {store.address}
                          </p>
                          {store.phone && (
                            <p style={{ margin: '5px 0', fontSize: '13px', color: '#424242' }}>
                              📞 {store.phone}
                            </p>
                          )}
                          {store.rating != null && (
                            <p style={{ margin: '5px 0', fontSize: '13px', color: '#424242' }}>
                              ⭐ {store.rating.toFixed(1)}
                            </p>
                          )}
                          {user && (
                            <div style={{ marginTop: '10px', display: 'flex', gap: '5px', flexDirection: 'column' }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedStoreForPanel(store);
                                  setShowStorePanel(true);
                                  loadStoreComments(store.id);
                                }}
                                style={{
                                  padding: '8px 12px',
                                  backgroundColor: '#2196F3',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  width: '100%'
                                }}
                              >
                                💬 ثبت نظر و عکس
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedStoreForDeactivation(store);
                                  setShowDeactivationModal(true);
                                }}
                                style={{
                                  padding: '8px 12px',
                                  backgroundColor: '#f44336',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  width: '100%'
                                }}
                              >
                                🚫 درخواست غیرفعال کردن
                              </button>
                            </div>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  ));
                })()}
              </MapContainer>
            ) : (
              <div style={{ 
                height: '100%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                backgroundColor: '#f5f5f5'
              }}>
                <p>در حال بارگذاری نقشه...</p>
              </div>
            )}
          </div>
          )}

          {/* Map - Mobile */}
          {isMobile && (
          <div style={{ 
            flex: 1, 
            position: isMapFullScreen ? 'fixed' : 'relative',
            top: isMapFullScreen ? 0 : 'auto',
            left: isMapFullScreen ? 0 : 'auto',
            right: isMapFullScreen ? 0 : 'auto',
            bottom: isMapFullScreen ? 0 : 'auto',
            display: isMobile ? (showMap ? 'block' : 'none') : 'none',
            height: isMapFullScreen ? '100vh' : (showList ? '40vh' : '100vh'),
            minHeight: isMapFullScreen ? '100vh' : '400px',
            width: '100%',
            zIndex: isMapFullScreen ? 9999 : 'auto',
            borderRadius: isMapFullScreen ? '0' : (showList ? '0' : '20px 20px 0 0'),
            overflow: 'hidden',
            transition: 'all 0.3s ease-in-out'
          }}>
            {/* دکمه خروج از حالت Full-Screen */}
            {isMapFullScreen && (
              <button
                onClick={() => setIsMapFullScreen(false)}
                style={{
                  position: 'absolute',
                  top: '15px',
                  right: '15px',
                  zIndex: 10000,
                  width: '45px',
                  height: '45px',
                  borderRadius: '50%',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                  transition: 'all 0.3s',
                  touchAction: 'manipulation'
                }}
                title="بازگشت به حالت عادی"
              >
                ✕
              </button>
            )}
            {mapCenter && !loading ? (
              <MapContainer
                center={mapCenter}
                zoom={15}
                style={{ height: '100%', width: '100%' }}
                key={`map-mobile-${mapCenter[0]}-${mapCenter[1]}`}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapCenter center={mapCenter} zoom={15} />
                <MapEventHandler onLongPress={(lat, lng) => handleAddStore(lat, lng)} />
                
                {/* Search radius circle */}
                {userLocation && 
                 Array.isArray(userLocation) && 
                 userLocation.length === 2 &&
                 typeof userLocation[0] === 'number' && 
                 typeof userLocation[1] === 'number' &&
                 !isNaN(userLocation[0]) && 
                 !isNaN(userLocation[1]) && (
                  <Circle
                    center={[userLocation[0], userLocation[1]]}
                    radius={maxDistance}
                    pathOptions={{
                      color: '#2196F3',
                      fillColor: '#2196F3',
                      fillOpacity: 0.1,
                      weight: 2
                    }}
                  />
                )}
                
                {/* User location marker */}
                {userLocation && 
                 Array.isArray(userLocation) && 
                 userLocation.length === 2 &&
                 typeof userLocation[0] === 'number' && 
                 typeof userLocation[1] === 'number' &&
                 !isNaN(userLocation[0]) && 
                 !isNaN(userLocation[1]) && (
                  <Marker position={[userLocation[0], userLocation[1]]}>
                    <Popup>
                      <div style={{ fontFamily: "'Vazirmatn', 'Tahoma', 'Arial', sans-serif" }}>
                        <strong>📍 موقعیت شما</strong>
                        {userNeighborhood && (
                          <p style={{ margin: '5px 0', fontSize: '12px', color: '#666' }}>
                            محله: {userNeighborhood}
                          </p>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                )}
                
                {/* Store markers */}
                {stores.map(store => {
                  if (!store.latitude || !store.longitude || 
                      isNaN(store.latitude) || isNaN(store.longitude)) {
                    return null;
                  }
                  return (
                    <Marker 
                      key={store.id} 
                      position={[store.latitude, store.longitude]}
                      icon={createCustomIcon(store, '#2196F3')}
                    >
                      <Popup>
                        <div style={{ fontFamily: "'Vazirmatn', 'Tahoma', 'Arial', sans-serif", minWidth: '200px', maxWidth: '300px' }}>
                          <h4 style={{ margin: '5px 0', color: '#1976D2', fontWeight: 600 }}>
                            {getCategoryIconForStore(store)} {store.name}
                          </h4>
                          <p style={{ margin: '5px 0', fontSize: '13px', color: '#424242' }}>
                            {store.address}
                          </p>
                          {store.distance && (
                            <p style={{ margin: '5px 0', fontSize: '12px', color: '#666' }}>
                              📏 فاصله: {store.distance.toFixed(0)} متر
                            </p>
                          )}
                          {user && (
                            <div style={{ marginTop: '10px', display: 'flex', gap: '5px', flexDirection: 'column' }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedStoreForPanel(store);
                                  setShowStorePanel(true);
                                  loadStoreComments(store.id);
                                }}
                                style={{
                                  padding: '8px 12px',
                                  backgroundColor: '#2196F3',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  width: '100%'
                                }}
                              >
                                💬 ثبت نظر و عکس
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedStoreForDeactivation(store);
                                  setShowDeactivationModal(true);
                                }}
                                style={{
                                  padding: '8px 12px',
                                  backgroundColor: '#f44336',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  width: '100%'
                                }}
                              >
                                🚫 درخواست غیرفعال کردن
                              </button>
                            </div>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
                
                {/* Neighborhood stores markers */}
                {showNeighborhoodStores && neighborhoodStores.map(store => {
                  if (!store.latitude || !store.longitude || 
                      isNaN(store.latitude) || isNaN(store.longitude)) {
                    return null;
                  }
                  return (
                    <Marker 
                      key={`neighborhood-${store.id}`} 
                      position={[store.latitude, store.longitude]}
                      icon={createCustomIcon(store, '#4CAF50')}
                    >
                      <Popup>
                        <div style={{ fontFamily: "'Vazirmatn', 'Tahoma', 'Arial', sans-serif", minWidth: '200px', maxWidth: '300px' }}>
                          <div style={{ 
                            padding: '4px 8px', 
                            backgroundColor: '#4CAF50', 
                            color: 'white', 
                            borderRadius: '4px', 
                            fontSize: '10px', 
                            marginBottom: '5px',
                            display: 'inline-block'
                          }}>
                            محله {userNeighborhood}
                          </div>
                          <h4 style={{ margin: '5px 0', color: '#1976D2', fontWeight: 600 }}>
                            {getCategoryIconForStore(store)} {store.name}
                          </h4>
                          <p style={{ margin: '5px 0', fontSize: '13px', color: '#424242' }}>
                            {store.address}
                          </p>
                          {user && (
                            <div style={{ marginTop: '10px', display: 'flex', gap: '5px', flexDirection: 'column' }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedStoreForPanel(store);
                                  setShowStorePanel(true);
                                  loadStoreComments(store.id);
                                }}
                                style={{
                                  padding: '8px 12px',
                                  backgroundColor: '#2196F3',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  width: '100%'
                                }}
                              >
                                💬 ثبت نظر و عکس
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedStoreForDeactivation(store);
                                  setShowDeactivationModal(true);
                                }}
                                style={{
                                  padding: '8px 12px',
                                  backgroundColor: '#f44336',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  width: '100%'
                                }}
                              >
                                🚫 درخواست غیرفعال کردن
                              </button>
                            </div>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            ) : (
              <div style={{ 
                height: '100%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                backgroundColor: '#f5f5f5'
              }}>
                <p>در حال بارگذاری نقشه...</p>
              </div>
            )}
          </div>
          )}
        </div>
      )}

      {/* Footer - Desktop Only */}
      {!isMobile && !isMapFullScreen && (
        <div style={{
          padding: '12px 20px',
          backgroundColor: '#f5f5f5',
          borderTop: '1px solid #ddd',
          boxShadow: '0 -2px 4px rgba(0,0,0,0.1)',
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          fontSize: '13px',
          color: '#666'
        }}>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span>📊 مارکت ویزیت</span>
            {userNeighborhood && (
              <span>🏘️ محله: {userNeighborhood}</span>
            )}
            <span>📋 تعداد مغازه‌ها: {stores.length}</span>
          </div>
          <div style={{ fontSize: '12px', color: '#999' }}>
            © {new Date().getFullYear()} - تمامی حقوق محفوظ است
          </div>
        </div>
      )}

      {/* Add Store Modal */}
      {showAddStoreModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: isMobile ? 'center' : 'flex-start',
          justifyContent: 'center',
          zIndex: 10000,
          paddingTop: isMobile ? '0' : '40px',
          padding: isMobile ? '0' : '40px 20px 20px 20px',
          overflowY: 'auto'
        }}
        onClick={() => {
          if (!submitting) {
            setShowAddStoreModal(false);
          }
        }}
        >
          <div style={{
            backgroundColor: 'white',
            padding: isMobile ? '20px' : '40px',
            borderRadius: isMobile ? '8px' : '16px',
            maxWidth: isMobile ? '100%' : '700px',
            width: isMobile ? '95%' : '100%',
            maxHeight: isMobile ? '95vh' : 'calc(100vh - 80px)',
            overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            margin: isMobile ? '10px' : '0',
            position: 'relative',
            animation: 'slideDown 0.3s ease-out'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0, fontSize: isMobile ? '18px' : '24px' }}>
              ثبت مغازه جدید
            </h2>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 500 }}>
                نام مغازه: *
              </label>
              <input
                type="text"
                value={newStoreName}
                onChange={(e) => setNewStoreName(e.target.value)}
                placeholder="نام مغازه"
                style={{
                  width: '100%',
                  padding: isMobile ? '12px' : '8px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontFamily: "'Vazirmatn', 'Tahoma', 'Arial', sans-serif",
                  fontSize: isMobile ? '16px' : '14px',
                  minHeight: '44px',
                  touchAction: 'manipulation'
                }}
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 500 }}>
                آدرس: *
              </label>
              <textarea
                value={newStoreAddress}
                onChange={(e) => setNewStoreAddress(e.target.value)}
                placeholder="آدرس کامل مغازه"
                style={{
                  width: '100%',
                  padding: isMobile ? '12px' : '8px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontFamily: "'Vazirmatn', 'Tahoma', 'Arial', sans-serif",
                  minHeight: isMobile ? '100px' : '80px',
                  fontSize: isMobile ? '16px' : '14px'
                }}
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 500 }}>
                دسته اصلی: *
              </label>
              <select
                value={selectedMainCategory}
                onChange={(e) => {
                  setSelectedMainCategory(e.target.value);
                  setNewStoreCategory('');
                  setNewStoreCategorySlug('');
                }}
                style={{
                  width: '100%',
                  padding: isMobile ? '12px' : '8px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontFamily: "'Vazirmatn', 'Tahoma', 'Arial', sans-serif",
                  fontSize: isMobile ? '16px' : '14px',
                  minHeight: '44px',
                  touchAction: 'manipulation',
                  backgroundColor: 'white'
                }}
                disabled={loadingCategories}
              >
                <option value="">
                  {loadingCategories ? 'در حال بارگذاری...' : storeCategories.length === 0 ? 'هیچ دسته‌ای یافت نشد' : 'انتخاب دسته اصلی...'}
                </option>
                {storeCategories.map((mainCat) => (
                  <option key={mainCat.id} value={mainCat.slug}>
                    {mainCat.title}
                  </option>
                ))}
              </select>
              {storeCategories.length === 0 && !loadingCategories && (
                <p style={{ marginTop: '5px', fontSize: '12px', color: '#f44336' }}>
                  ⚠️ دسته‌بندی‌ها یافت نشد. لطفاً ابتدا جداول را ایجاد و داده‌ها را import کنید.
                </p>
              )}
            </div>
            
            {selectedMainCategory && (
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 500 }}>
                  زیردسته: *
                </label>
                <select
                  value={newStoreCategorySlug}
                  onChange={(e) => {
                    const selectedSubCat = storeCategories
                      .find(mc => mc.slug === selectedMainCategory)
                      ?.categories.find((sc: any) => sc.slug === e.target.value);
                    if (selectedSubCat) {
                      setNewStoreCategory(selectedSubCat.name);
                      setNewStoreCategorySlug(selectedSubCat.slug);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: isMobile ? '12px' : '8px',
                    borderRadius: '4px',
                    border: '1px solid #ddd',
                    fontFamily: "'Vazirmatn', 'Tahoma', 'Arial', sans-serif",
                    fontSize: isMobile ? '16px' : '14px',
                    minHeight: '44px',
                    touchAction: 'manipulation',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="">انتخاب زیردسته...</option>
                  {storeCategories
                    .find(mc => mc.slug === selectedMainCategory)
                    ?.categories.map((subCat: any) => (
                      <option key={subCat.id} value={subCat.slug}>
                        {subCat.icon ? `${subCat.icon} ` : ''}{subCat.name}
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 500 }}>
                تلفن:
              </label>
              <input
                type="tel"
                value={newStorePhone}
                onChange={(e) => setNewStorePhone(e.target.value)}
                placeholder="شماره تلفن"
                style={{
                  width: '100%',
                  padding: isMobile ? '12px' : '8px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontFamily: "'Vazirmatn', 'Tahoma', 'Arial', sans-serif",
                  fontSize: isMobile ? '16px' : '14px',
                  minHeight: '44px',
                  touchAction: 'manipulation'
                }}
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 500 }}>
                پلاک:
              </label>
              <input
                type="text"
                value={newStorePlateNumber}
                onChange={(e) => setNewStorePlateNumber(e.target.value)}
                placeholder="شماره پلاک"
                style={{
                  width: '100%',
                  padding: isMobile ? '12px' : '8px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontFamily: "'Vazirmatn', 'Tahoma', 'Arial', sans-serif",
                  fontSize: isMobile ? '16px' : '14px',
                  minHeight: '44px',
                  touchAction: 'manipulation'
                }}
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 500 }}>
                کد پستی:
              </label>
              <input
                type="text"
                value={newStorePostalCode}
                onChange={(e) => setNewStorePostalCode(e.target.value)}
                placeholder="کد پستی"
                style={{
                  width: '100%',
                  padding: isMobile ? '12px' : '8px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontFamily: "'Vazirmatn', 'Tahoma', 'Arial', sans-serif",
                  fontSize: isMobile ? '16px' : '14px',
                  minHeight: '44px',
                  touchAction: 'manipulation'
                }}
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={newStoreIsActive}
                  onChange={(e) => setNewStoreIsActive(e.target.checked)}
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
                <span style={{ fontWeight: 500 }}>مغازه فعال است</span>
              </label>
            </div>

            {user && (
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 500 }}>
                  عکس‌ها:
                </label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  style={{
                    width: '100%',
                    padding: isMobile ? '12px' : '8px',
                    borderRadius: '4px',
                    border: '1px solid #ddd',
                    fontFamily: "'Vazirmatn', 'Tahoma', 'Arial', sans-serif",
                    fontSize: isMobile ? '16px' : '14px',
                    minHeight: '44px',
                    touchAction: 'manipulation'
                  }}
                />
                {newStoreImageUrls.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
                    {newStoreImageUrls.map((url, index) => (
                      <div key={index} style={{ position: 'relative', width: '100px', height: '100px' }}>
                        <img
                          src={url}
                          alt={`Preview ${index + 1}`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }}
                        />
                        <button
                          onClick={() => removeImage(index)}
                          style={{
                            position: 'absolute',
                            top: '5px',
                            right: '5px',
                            backgroundColor: 'red',
                            color: 'white',
                            border: 'none',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            cursor: 'pointer',
                            fontSize: '14px'
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {newStoreLat && newStoreLng && (
              <div style={{ marginBottom: '15px' }}>
                <p style={{ fontSize: '12px', color: '#666' }}>
                  📍 مختصات: {newStoreLat.toFixed(6)}, {newStoreLng.toFixed(6)}
                </p>
                {loadingAddress && (
                  <p style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                    در حال دریافت آدرس...
                  </p>
                )}
              </div>
            )}

            <div style={{ 
              display: 'flex', 
              gap: '10px', 
              justifyContent: 'flex-end',
              flexDirection: isMobile ? 'column' : 'row'
            }}>
              <button
                onClick={() => {
                  setShowAddStoreModal(false);
                  setNewStoreName('');
                  setNewStoreAddress('');
                  setNewStoreCategory('');
                  setNewStoreCategorySlug('');
                  setSelectedMainCategory('');
                  setNewStorePhone('');
                  setNewStoreCity('');
                  setNewStoreProvince('');
                  setNewStorePlateNumber('');
                  setNewStorePostalCode('');
                  setNewStoreIsActive(true);
                  setNewStoreImages([]);
                  setNewStoreImageUrls([]);
                  setNewStoreLat(null);
                  setNewStoreLng(null);
                }}
                style={{
                  padding: isMobile ? '12px 20px' : '10px 20px',
                  backgroundColor: '#757575',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontFamily: "'Vazirmatn', 'Tahoma', 'Arial', sans-serif",
                  width: isMobile ? '100%' : 'auto',
                  fontSize: isMobile ? '14px' : '14px',
                  minHeight: '44px',
                  touchAction: 'manipulation'
                }}
              >
                انصراف
              </button>
              <button
                onClick={submitNewStore}
                disabled={submitting || !newStoreName || !newStoreAddress || !newStoreCategory || !newStoreCategorySlug}
                style={{
                  padding: isMobile ? '12px 20px' : '10px 20px',
                  backgroundColor: submitting || !newStoreName || !newStoreAddress || !newStoreCategory || !newStoreCategorySlug ? '#ccc' : '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: submitting || !newStoreName || !newStoreAddress || !newStoreCategory || !newStoreCategorySlug ? 'not-allowed' : 'pointer',
                  fontFamily: "'Vazirmatn', 'Tahoma', 'Arial', sans-serif",
                  width: isMobile ? '100%' : 'auto',
                  fontSize: isMobile ? '14px' : '14px',
                  minHeight: '44px',
                  touchAction: 'manipulation'
                }}
              >
                {submitting ? 'در حال ثبت...' : 'ثبت مغازه'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Store Comment/Photo Panel */}
      {showStorePanel && selectedStoreForPanel && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'white',
          borderTop: '2px solid #2196F3',
          borderRadius: '20px 20px 0 0',
          maxHeight: '80vh',
          overflowY: 'auto',
          zIndex: 1002,
          boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
          padding: isMobile ? '15px' : '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0, color: '#1976D2' }}>
              {getCategoryIconForStore(selectedStoreForPanel)} {selectedStoreForPanel.name}
            </h3>
            <button
              onClick={() => {
                setShowStorePanel(false);
                setSelectedStoreForPanel(null);
                setCommentText('');
                setCommentRating(5);
                setCommentImages([]);
                setCommentImageUrls([]);
              }}
              style={{
                padding: '5px 10px',
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '18px'
              }}
            >
              ✕
            </button>
          </div>

          {/* Change Location Button */}
          <div style={{ marginBottom: '15px' }}>
            <button
              onClick={handleUpdateLocation}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500
              }}
            >
              📍 به‌روزرسانی لوکیشن من
            </button>
          </div>

          {/* Comment Form */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 500 }}>
              نظر شما:
            </label>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="نظر خود را بنویسید..."
              style={{
                width: '100%',
                minHeight: '80px',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Rating */}
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 500 }}>
              امتیاز (1-10):
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={commentRating}
              onChange={(e) => setCommentRating(Number(e.target.value))}
              style={{ width: '100%' }}
            />
            <div style={{ textAlign: 'center', marginTop: '5px', fontSize: '18px', fontWeight: 600, color: '#1976D2' }}>
              {commentRating} ⭐
            </div>
          </div>

          {/* Image Upload */}
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 500 }}>
              عکس‌ها:
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleCommentImageUpload}
              style={{ width: '100%', padding: '5px' }}
            />
            {commentImageUrls.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
                {commentImageUrls.map((url, index) => (
                  <div key={index} style={{ position: 'relative', width: '100px', height: '100px' }}>
                    <img
                      src={url}
                      alt={`Preview ${index + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }}
                    />
                    <button
                      onClick={() => removeCommentImage(index)}
                      style={{
                        position: 'absolute',
                        top: '-5px',
                        right: '-5px',
                        backgroundColor: '#f44336',
                        color: 'white',
                        border: 'none',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        cursor: 'pointer',
                        fontSize: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            onClick={submitComment}
            disabled={submittingComment || !commentText.trim()}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: submittingComment ? '#ccc' : '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: submittingComment ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: 600,
              marginBottom: '15px'
            }}
          >
            {submittingComment ? 'در حال ثبت...' : '📝 ثبت نظر'}
          </button>

          {/* Comments List */}
          <div style={{ marginTop: '20px', borderTop: '1px solid #ddd', paddingTop: '15px' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>نظرات ({storeComments.length})</h4>
            {loadingComments ? (
              <p style={{ textAlign: 'center', color: '#666' }}>در حال بارگذاری...</p>
            ) : storeComments.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#666' }}>هنوز نظری ثبت نشده است</p>
            ) : (
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {storeComments.map((comment) => (
                  <div key={comment.id} style={{ 
                    padding: '10px', 
                    marginBottom: '10px', 
                    backgroundColor: '#f5f5f5', 
                    borderRadius: '4px' 
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <strong style={{ fontSize: '14px' }}>{comment.fullName || comment.username || 'کاربر'}</strong>
                      <span style={{ fontSize: '12px', color: '#666' }}>
                        {comment.rating ? `⭐ ${comment.rating}` : ''}
                      </span>
                    </div>
                    <p style={{ margin: '5px 0', fontSize: '13px', color: '#424242' }}>
                      {comment.comment}
                    </p>
                    {comment.image_urls && comment.image_urls.length > 0 && (
                      <div style={{ display: 'flex', gap: '5px', marginTop: '5px', flexWrap: 'wrap' }}>
                        {comment.image_urls.map((imgUrl: string, idx: number) => (
                          <img
                            key={idx}
                            src={imgUrl.startsWith('http') ? imgUrl : `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${imgUrl}`}
                            alt={`Comment image ${idx + 1}`}
                            style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '4px' }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Deactivation Request Modal */}
      {showDeactivationModal && selectedStoreForDeactivation && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          zIndex: 10000,
          display: 'flex',
          alignItems: isMobile ? 'center' : 'flex-start',
          justifyContent: 'center',
          paddingTop: isMobile ? '0' : '40px',
          padding: isMobile ? '0' : '40px 20px 20px 20px',
          overflowY: 'auto'
        }}
        onClick={() => {
          if (!submittingDeactivation) {
            setShowDeactivationModal(false);
            setSelectedStoreForDeactivation(null);
            setDeactivationReason('');
          }
        }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: isMobile ? '8px' : '16px',
              padding: isMobile ? '25px' : '40px',
              maxWidth: isMobile ? '100%' : '550px',
              width: isMobile ? '95%' : '100%',
              maxHeight: isMobile ? '95vh' : 'calc(100vh - 80px)',
              overflowY: 'auto',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              position: 'relative',
              animation: 'slideDown 0.3s ease-out'
            }}
          >
            <h2 style={{ margin: '0 0 20px 0', color: '#f44336', fontSize: '20px' }}>
              🚫 درخواست غیرفعال کردن مغازه
            </h2>
            
            <div style={{ marginBottom: '20px' }}>
              <p style={{ margin: '0 0 10px 0', fontWeight: 600 }}>مغازه:</p>
              <p style={{ margin: 0, color: '#666' }}>
                {selectedStoreForDeactivation.name}
              </p>
              {selectedStoreForDeactivation.address && (
                <p style={{ margin: '5px 0 0 0', color: '#999', fontSize: '14px' }}>
                  {selectedStoreForDeactivation.address}
                </p>
              )}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                دلیل غیرفعال کردن (اختیاری):
              </label>
              <textarea
                value={deactivationReason}
                onChange={(e) => setDeactivationReason(e.target.value)}
                placeholder="دلیل غیرفعال کردن مغازه را وارد کنید..."
                style={{
                  width: '100%',
                  minHeight: '100px',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ 
              padding: '12px', 
              backgroundColor: '#fff3cd', 
              borderRadius: '4px',
              marginBottom: '20px',
              fontSize: '13px',
              color: '#856404'
            }}>
              ⚠️ این درخواست برای بررسی به مدیر سیستم ارسال می‌شود. پس از تایید، مغازه غیرفعال خواهد شد.
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowDeactivationModal(false);
                  setSelectedStoreForDeactivation(null);
                  setDeactivationReason('');
                }}
                disabled={submittingDeactivation}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: submittingDeactivation ? 'not-allowed' : 'pointer',
                  fontSize: '14px'
                }}
              >
                انصراف
              </button>
              <button
                onClick={submitDeactivationRequest}
                disabled={submittingDeactivation}
                style={{
                  padding: '10px 20px',
                  backgroundColor: submittingDeactivation ? '#ccc' : '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: submittingDeactivation ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 600
                }}
              >
                {submittingDeactivation ? 'در حال ارسال...' : 'ارسال درخواست'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Login Modal */}
      {showLoginModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          zIndex: 10000,
          display: 'flex',
          alignItems: isMobile ? 'center' : 'flex-start',
          justifyContent: 'center',
          paddingTop: isMobile ? '20px' : '40px',
          padding: isMobile ? '20px' : '40px 20px 20px 20px',
          overflowY: 'auto'
        }}
        onClick={() => {
          if (!loggingIn) {
            setShowLoginModal(false);
            setLoginUsername('');
            setLoginPassword('');
          }
        }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: isMobile ? '8px' : '16px',
              padding: isMobile ? '30px' : '40px',
              maxWidth: isMobile ? '100%' : '450px',
              width: isMobile ? '95%' : '100%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              position: 'relative',
              animation: 'slideDown 0.3s ease-out'
            }}
          >
            <h2 style={{ margin: '0 0 25px 0', color: '#1976D2', fontSize: '24px', textAlign: 'center' }}>
              🔐 ورود به حساب کاربری
            </h2>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '14px' }}>
                نام کاربری:
              </label>
              <input
                type="text"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="نام کاربری خود را وارد کنید"
                disabled={loggingIn}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && loginUsername && loginPassword) {
                    handleLogin();
                  }
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box'
                }}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '14px' }}>
                رمز عبور:
              </label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="رمز عبور خود را وارد کنید"
                disabled={loggingIn}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && loginUsername && loginPassword) {
                    handleLogin();
                  }
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {error && (
              <div style={{
                padding: '10px',
                backgroundColor: '#ffebee',
                color: '#c62828',
                borderRadius: '4px',
                marginBottom: '20px',
                fontSize: '13px'
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowLoginModal(false);
                  setLoginUsername('');
                  setLoginPassword('');
                  setError(null);
                }}
                disabled={loggingIn}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loggingIn ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                انصراف
              </button>
              <button
                onClick={handleLogin}
                disabled={loggingIn || !loginUsername.trim() || !loginPassword.trim()}
                style={{
                  padding: '10px 20px',
                  backgroundColor: loggingIn || !loginUsername.trim() || !loginPassword.trim() ? '#ccc' : '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loggingIn || !loginUsername.trim() || !loginPassword.trim() ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 600
                }}
              >
                {loggingIn ? 'در حال ورود...' : 'ورود'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
