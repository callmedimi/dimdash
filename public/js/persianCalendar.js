/**
 * DimDash Offline Solar Hijri (Shamsi / Persian) & Gregorian Calendar Engine
 * 100% Air-gapped & Offline - Zero external network calls
 */
(function(global) {
  'use strict';

  const PERSIAN_MONTHS = [
    'فروردین', 'اردیبهشت', 'خرداد',
    'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر',
    'دی', 'بهمن', 'اسفند'
  ];

  const PERSIAN_WEEKDAYS = [
    'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'
  ];

  const GREGORIAN_MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const GREGORIAN_WEEKDAYS = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
  ];

  const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

  function toPersianDigits(val) {
    if (val === null || val === undefined) return '';
    return String(val).replace(/[0-9]/g, d => PERSIAN_DIGITS[parseInt(d, 10)]);
  }

  function toLatinDigits(val) {
    if (val === null || val === undefined) return '';
    return String(val).replace(/[۰-۹]/g, d => PERSIAN_DIGITS.indexOf(d));
  }

  // Pure mathematical algorithm for Jalali conversion (Birashk / Kazimierz standard)
  function gregorianToJalali(gy, gm, gd) {
    const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let jy = (gy <= 1600) ? 0 : 979;
    gy -= (gy <= 1600) ? 621 : 1600;
    const gy2 = (gm > 2) ? (gy + 1) : gy;
    let days = (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) - 80 + gd + g_d_m[gm - 1];
    jy += 33 * Math.floor(days / 12053);
    days %= 12053;
    jy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) {
      jy += Math.floor((days - 1) / 365);
      days = (days - 1) % 365;
    }
    const jm = (days < 186) ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
    const jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
    return { jy, jm, jd };
  }

  // Check native Intl Persian support
  let hasNativePersian = false;
  try {
    const testFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric' });
    hasNativePersian = !!testFmt;
  } catch (_) {
    hasNativePersian = false;
  }

  const DimDashCalendar = {
    PERSIAN_MONTHS,
    PERSIAN_WEEKDAYS,
    GREGORIAN_MONTHS,
    GREGORIAN_WEEKDAYS,
    toPersianDigits,
    toLatinDigits,

    getNowInfo(date = new Date()) {
      const gy = date.getFullYear();
      const gm = date.getMonth(); // 0-indexed
      const gd = date.getDate();
      const dayOfWeek = date.getDay(); // 0: Sunday ... 6: Saturday

      let jy, jm, jd;
      let faMonthName, faWeekdayName;

      if (hasNativePersian) {
        try {
          const parts = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric'
          }).formatToParts(date);

          for (const p of parts) {
            if (p.type === 'year') jy = parseInt(p.value, 10);
            if (p.type === 'month') jm = parseInt(p.value, 10);
            if (p.type === 'day') jd = parseInt(p.value, 10);
          }
        } catch (_) {}
      }

      if (!jy || !jm || !jd) {
        const jCalc = gregorianToJalali(gy, gm + 1, gd);
        jy = jCalc.jy;
        jm = jCalc.jm;
        jd = jCalc.jd;
      }

      faMonthName = PERSIAN_MONTHS[jm - 1] || '';
      faWeekdayName = PERSIAN_WEEKDAYS[dayOfWeek] || '';

      const enMonthName = GREGORIAN_MONTHS[gm] || '';
      const enWeekdayName = GREGORIAN_WEEKDAYS[dayOfWeek] || '';

      // Hours, Minutes, Seconds
      const hours24 = date.getHours();
      const minutes = date.getMinutes();
      const seconds = date.getSeconds();
      const pad2 = n => String(n).padStart(2, '0');

      const isPM = hours24 >= 12;
      const hours12 = hours24 % 12 || 12;
      const ampmEn = isPM ? 'PM' : 'AM';
      const ampmFa = isPM ? 'ب.ظ' : 'ق.ظ';

      return {
        // Date objects
        raw: date,
        dayOfWeek,

        // Solar Hijri / Shamsi
        shamsi: {
          year: jy,
          month: jm,
          day: jd,
          monthName: faMonthName,
          weekday: faWeekdayName,
          fullFa: `${faWeekdayName} ${toPersianDigits(jd)} ${faMonthName} ${toPersianDigits(jy)}`,
          shortFa: `${toPersianDigits(jy)}/${toPersianDigits(pad2(jm))}/${toPersianDigits(pad2(jd))}`,
          fullEnDigits: `${faWeekdayName} ${jd} ${faMonthName} ${jy}`,
          shortEnDigits: `${jy}/${pad2(jm)}/${pad2(jd)}`
        },

        // Gregorian
        gregorian: {
          year: gy,
          month: gm + 1,
          day: gd,
          monthName: enMonthName,
          weekday: enWeekdayName,
          full: `${enWeekdayName}, ${enMonthName} ${gd}, ${gy}`,
          short: `${gy}-${pad2(gm + 1)}-${pad2(gd)}`
        },

        // Time
        time: {
          hours24: pad2(hours24),
          hours12: pad2(hours12),
          minutes: pad2(minutes),
          seconds: pad2(seconds),
          isPM,
          ampmEn,
          ampmFa,
          time24: `${pad2(hours24)}:${pad2(minutes)}:${pad2(seconds)}`,
          time12: `${pad2(hours12)}:${pad2(minutes)}:${pad2(seconds)} ${ampmEn}`,
          time12Fa: `${toPersianDigits(pad2(hours12))}:${toPersianDigits(pad2(minutes))}:${toPersianDigits(pad2(seconds))} ${ampmFa}`
        }
      };
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DimDashCalendar;
  } else {
    global.DimDashCalendar = DimDashCalendar;
  }
})(typeof window !== 'undefined' ? window : globalThis);
