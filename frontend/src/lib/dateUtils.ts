import { toJalaali, toGregorian } from 'jalaali-js';

/**
 * تبدیل تاریخ میلادی به شمسی
 * @param dateStr - تاریخ میلادی به فرمت YYYY-MM-DD یا YYYY/MM/DD
 * @returns تاریخ شمسی به فرمت YYYY/MM/DD
 */
export function toJalaliDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  
  try {
    // اگر تاریخ از backend به فرمت شمسی آمده باشد، همان را برگردان
    if (dateStr.includes('/') && dateStr.split('/').length === 3) {
      const parts = dateStr.split('/');
      if (parts[0].length === 4 && parseInt(parts[0]) > 1300) {
        // احتمالاً شمسی است
        return dateStr;
      }
    }
    
    // تبدیل از میلادی به شمسی
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return dateStr; // اگر تاریخ معتبر نبود، همان را برگردان
    }
    
    const jDate = toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate());
    return `${jDate.jy}/${String(jDate.jm).padStart(2, '0')}/${String(jDate.jd).padStart(2, '0')}`;
  } catch (error) {
    // Silent error
    return dateStr;
  }
}

/**
 * تبدیل datetime میلادی به شمسی
 * @param dateTimeStr - datetime میلادی
 * @returns datetime شمسی به فرمت YYYY/MM/DD HH:MM:SS
 */
export function toJalaliDateTime(dateTimeStr: string | null | undefined): string {
  if (!dateTimeStr) return '';
  
  try {
    // اگر datetime از backend به فرمت شمسی آمده باشد، همان را برگردان
    if (dateTimeStr.includes('/') && dateTimeStr.split('/').length >= 3) {
      const parts = dateTimeStr.split(' ');
      if (parts[0].split('/')[0].length === 4 && parseInt(parts[0].split('/')[0]) > 1300) {
        // احتمالاً شمسی است
        return dateTimeStr;
      }
    }
    
    const date = new Date(dateTimeStr);
    if (isNaN(date.getTime())) {
      return dateTimeStr;
    }
    
    const jDate = toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate());
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${jDate.jy}/${String(jDate.jm).padStart(2, '0')}/${String(jDate.jd).padStart(2, '0')} ${hours}:${minutes}:${seconds}`;
  } catch (error) {
    // Silent error
    return dateTimeStr;
  }
}

/**
 * تبدیل تاریخ شمسی به میلادی برای ارسال به backend
 * @param jalaliDateStr - تاریخ شمسی به فرمت YYYY/MM/DD
 * @returns تاریخ میلادی به فرمت YYYY-MM-DD
 */
export function jalaliToGregorian(jalaliDateStr: string): string {
  if (!jalaliDateStr) return '';
  
  try {
    const parts = jalaliDateStr.split('/');
    if (parts.length !== 3) return jalaliDateStr;
    
    const jy = parseInt(parts[0]);
    const jm = parseInt(parts[1]);
    const jd = parseInt(parts[2]);
    
    if (isNaN(jy) || isNaN(jm) || isNaN(jd)) return jalaliDateStr;
    
    const gDate = toGregorian(jy, jm, jd);
    return `${gDate.gy}-${String(gDate.gm).padStart(2, '0')}-${String(gDate.gd).padStart(2, '0')}`;
  } catch (error) {
    // Silent error
    return jalaliDateStr;
  }
}

/**
 * دریافت تاریخ امروز به شمسی
 * @returns تاریخ امروز به فرمت YYYY/MM/DD
 */
export function getTodayJalali(): string {
  const today = new Date();
  const jDate = toJalaali(today.getFullYear(), today.getMonth() + 1, today.getDate());
  return `${jDate.jy}/${String(jDate.jm).padStart(2, '0')}/${String(jDate.jd).padStart(2, '0')}`;
}

