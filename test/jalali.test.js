const test = require('node:test');
const assert = require('node:assert');
const DimDashCalendar = require('../public/js/persianCalendar');

test('P10 Jalali Calendar: 200-Date Benchmark & Leap Year Precision', async (t) => {
  const { gregorianToJalali, getNowInfo, toPersianDigits } = DimDashCalendar;

  await t.test('converts known historical dates and Nowruz transitions accurately', () => {
    // 2024-03-20 -> 1403/01/01 (Nowruz 1403 - Leap Year)
    const d1 = gregorianToJalali(2024, 3, 20);
    assert.strictEqual(d1.jy, 1403);
    assert.strictEqual(d1.jm, 1);
    assert.strictEqual(d1.jd, 1);

    // 2024-03-19 -> 1402/12/29 (Last day of 1402)
    const d2 = gregorianToJalali(2024, 3, 19);
    assert.strictEqual(d2.jy, 1402);
    assert.strictEqual(d2.jm, 12);
    assert.strictEqual(d2.jd, 29);

    // 2025-03-20 -> 1403/12/30 (Esfand 30 in Leap year 1403)
    const d3 = gregorianToJalali(2025, 3, 20);
    assert.strictEqual(d3.jy, 1403);
    assert.strictEqual(d3.jm, 12);
    assert.strictEqual(d3.jd, 30);

    // 2026-10-22 -> 1405/07/30 (Mehr 30)
    const d4 = gregorianToJalali(2026, 10, 22);
    assert.strictEqual(d4.jy, 1405);
    assert.strictEqual(d4.jm, 7);
    assert.strictEqual(d4.jd, 30);
  });

  await t.test('validates 200 dates across 20 years comparing mathematical algorithm against Intl', () => {
    // Benchmark 200 distinct dates from 2020 through 2040
    let verifiedCount = 0;
    const baseDate = new Date(2020, 0, 1);

    for (let i = 0; i < 200; i++) {
      const cur = new Date(baseDate.getTime() + i * 37 * 24 * 3600 * 1000); // Step ~37 days
      const gy = cur.getFullYear();
      const gm = cur.getMonth() + 1;
      const gd = cur.getDate();

      const algoRes = gregorianToJalali(gy, gm, gd);

      // Compare with native Intl.DateTimeFormat
      const intlParts = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
      }).formatToParts(cur);

      let intlY, intlM, intlD;
      for (const p of intlParts) {
        if (p.type === 'year') intlY = parseInt(p.value, 10);
        if (p.type === 'month') intlM = parseInt(p.value, 10);
        if (p.type === 'day') intlD = parseInt(p.value, 10);
      }

      assert.strictEqual(algoRes.jy, intlY, `Year mismatch on ${gy}-${gm}-${gd}: algo=${algoRes.jy}, intl=${intlY}`);
      assert.strictEqual(algoRes.jm, intlM, `Month mismatch on ${gy}-${gm}-${gd}: algo=${algoRes.jm}, intl=${intlM}`);
      assert.strictEqual(algoRes.jd, intlD, `Day mismatch on ${gy}-${gm}-${gd}: algo=${algoRes.jd}, intl=${intlD}`);

      verifiedCount++;
    }

    assert.strictEqual(verifiedCount, 200);
  });

  await t.test('getNowInfo produces accurate dual calendar payloads and Persian formatting', () => {
    const testDate = new Date(2026, 9, 22, 10, 30, 45); // Oct 22, 2026 10:30:45
    const info = getNowInfo(testDate);

    assert.strictEqual(info.gregorian.year, 2026);
    assert.strictEqual(info.gregorian.month, 10);
    assert.strictEqual(info.gregorian.day, 22);

    assert.strictEqual(info.shamsi.year, 1405);
    assert.strictEqual(info.shamsi.month, 7);
    assert.strictEqual(info.shamsi.day, 30);
    assert.strictEqual(info.shamsi.monthName, 'مهر');

    assert.strictEqual(info.time.hours24, '10');
    assert.strictEqual(info.time.minutes, '30');
    assert.strictEqual(info.time.seconds, '45');
  });

  await t.test('converts digits between Persian and Latin properly', () => {
    assert.strictEqual(toPersianDigits('2026'), '۲۰۲۶');
    assert.strictEqual(toPersianDigits(1405), '۱۴۰۵');
    assert.strictEqual(toPersianDigits('0123456789'), '۰۱۲۳۴۵۶۷۸۹');
  });
});
