exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600'
  };

  const type = event.queryStringParameters?.type || 'lotto';
  const year = new Date().getFullYear() - 1911;

  try {
    if (type === 'hk') {
      const data = await fetchHKData();
      if (!data || data.length === 0) {
        return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: '無法取得六合彩資料' }) };
      }
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ success: true, count: data.length, data, updatedAt: new Date().toISOString() })
      };
    }

    let data = [];
    for (const y of [year, year - 1]) {
      const url = type === 'lotto'
        ? `https://www.taiwanlottery.com/lotto/result/lotto649/${y}.csv`
        : `https://www.taiwanlottery.com/lotto/result/super_lotto638/${y}.csv`;
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.taiwanlottery.com/' } });
        if (!res.ok) continue;
        const text = await res.text();
        const parsed = type === 'lotto' ? parseLottoCSV(text) : parsePowerCSV(text);
        data = [...parsed, ...data];
      } catch(e) {}
    }

    if (data.length === 0) {
      return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: '無法取得資料' }) };
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ success: true, count: data.length, data: data.slice(0, 100), updatedAt: new Date().toISOString() })
    };

  } catch(error) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: error.message }) };
  }
};

// 從 lotteryextreme.com 抓取六合彩（UTF-8，無編碼問題）
async function fetchHKData() {
  const draws = [];
  const currentYear = new Date().getFullYear();

  for (const year of [currentYear, currentYear - 1]) {
    for (let month = 12; month >= 1; month--) {
      if (draws.length >= 100) break;
      try {
        const m = String(month).padStart(2, '0');
        const url = `https://www.lotteryextreme.com/marksix/results/${year}-${m}`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html',
            'Referer': 'https://www.lotteryextreme.com/marksix/'
          }
        });
        if (!res.ok) continue;
        const html = await res.text();

        // 解析格式: 25/04/2026 Saturday (26/045) ... * 4* 16* 21* 36* 42* 46* * 9
        const dateRe = /(\d{2}\/\d{2}\/\d{4})\s+\w+\s+\((\d{2}\/(\d{3}))\)/g;
        const positions = [];
        let dm;
        while ((dm = dateRe.exec(html)) !== null) {
          positions.push({ date: dm[1], period: dm[2].replace('/', ''), idx: dm.index });
        }

        for (let i = 0; i < positions.length; i++) {
          const start = positions[i].idx;
          const end = positions[i + 1] ? positions[i + 1].idx : start + 500;
          const chunk = html.slice(start, end);

          // 找號碼: * 4* 16* 21* 36* 42* 46* * 9
          const numMatches = chunk.match(/\*\s*(\d{1,2})/g);
          if (!numMatches || numMatches.length < 7) continue;

          const allNums = numMatches.map(s => parseInt(s.replace('*', '').trim()));
          const main = allNums.slice(0, 6).filter(n => n >= 1 && n <= 49);
          const special = allNums[6];

          if (main.length === 6 && special >= 1 && special <= 49) {
            // 轉換日期格式 DD/MM/YYYY -> YYYY/MM/DD
            const parts = positions[i].date.split('/');
            const dateStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
            draws.push({
              period: positions[i].period,
              date: dateStr,
              main: main.sort((a,b) => a-b),
              special
            });
          }
        }
      } catch(e) { continue; }
    }
    if (draws.length >= 100) break;
  }

  return draws;
}

function parseLottoCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const results = [];
  for (const line of lines) {
    const cols = line.split(',').map(s => s.trim().replace(/^\uFEFF/, ''));
    if (!cols[0].includes('\u5927\u6a02\u900f')) continue;
    try {
      const nums = [cols[6],cols[7],cols[8],cols[9],cols[10],cols[11]].map(Number).filter(n => n>=1&&n<=49);
      const special = parseInt(cols[12]);
      if (nums.length === 6 && special >= 1 && special <= 49) {
        results.push({ period: cols[1], date: cols[2], main: nums.sort((a,b)=>a-b), special });
      }
    } catch(e) {}
  }
  return results.reverse();
}

function parsePowerCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const results = [];
  for (const line of lines) {
    const cols = line.split(',').map(s => s.trim().replace(/^\uFEFF/, ''));
    if (!cols[0].includes('\u5a01\u529b\u5f69')) continue;
    try {
      const nums = [cols[6],cols[7],cols[8],cols[9],cols[10],cols[11]].map(Number).filter(n => n>=1&&n<=38);
      const bonus = parseInt(cols[12]);
      if (nums.length === 6 && bonus >= 1 && bonus <= 8) {
        results.push({ period: cols[1], date: cols[2], main: nums.sort((a,b)=>a-b), bonus });
      }
    } catch(e) {}
  }
  return results.reverse();
}
