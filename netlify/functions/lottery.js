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

// Big5 解碼對照表（常用中文字元）
function decodeBig5Buffer(buffer) {
  // 用 latin1 讀取，再用 iconv-like 方式處理
  // Netlify Node.js 環境支援 Buffer
  try {
    const buf = Buffer.from(buffer);
    // 嘗試用 utf-8
    const utf8 = buf.toString('utf-8');
    if (!utf8.includes('�')) return utf8;
    // 嘗試 latin1 後找數字資料
    return buf.toString('latin1');
  } catch(e) {
    return '';
  }
}

async function fetchHKData() {
  const draws = [];

  for (let page = 1; page <= 5; page++) {
    try {
      const url = `https://www.pilio.idv.tw/ltohk/listbbk.asp?indexpage=${page}&orderby=new`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Charset': 'big5,utf-8',
          'Referer': 'https://www.pilio.idv.tw/'
        }
      });

      if (!res.ok) break;

      const arrayBuffer = await res.arrayBuffer();
      const buf = Buffer.from(arrayBuffer);

      // Netlify Node.js 環境支援 iconv-lite（內建）
      let html = '';
      try {
        // 嘗試直接用 TextDecoder
        const decoder = new TextDecoder('big5');
        html = decoder.decode(arrayBuffer);
      } catch(e1) {
        try {
          // 備援：用 latin1
          html = buf.toString('latin1');
        } catch(e2) {
          html = buf.toString('utf8');
        }
      }

      // 解析號碼 - 找數字模式
      // 格式: | 3329 | 2026/05/16 | 11 , 25 , 28 , 36 , 41 , 43 | 22 |
      const rowRe = /(\d{3,4})\s*[|｜]\s*(\d{4}\/\d{2}\/\d{2})\s*[|｜]\s*([\d\s,，]+?)\s*[|｜]\s*(\d{1,2})\s*[|｜]/g;
      let m;
      while ((m = rowRe.exec(html)) !== null) {
        const numStr = m[3].replace(/[，,]/g, ' ').trim();
        const main = numStr.split(/\s+/).map(Number).filter(n => n >= 1 && n <= 49);
        const special = parseInt(m[4]);
        if (main.length === 6 && special >= 1 && special <= 49) {
          // 避免重複
          if (!draws.find(d => d.period === m[1])) {
            draws.push({ period: m[1], date: m[2], main: main.sort((a,b)=>a-b), special });
          }
        }
      }

      // 備援解析：直接抓表格中的數字行
      if (draws.length === 0 || (page === 1 && draws.length < 5)) {
        const lines = html.split('\n');
        for (const line of lines) {
          const dateMatch = line.match(/(\d{4}\/\d{2}\/\d{2})/);
          if (!dateMatch) continue;
          const allNums = line.match(/\b(\d{1,2})\b/g);
          if (!allNums || allNums.length < 7) continue;
          const nums = allNums.map(Number).filter(n => n >= 1 && n <= 49);
          if (nums.length >= 7) {
            const period = (line.match(/\b(\d{3,4})\b/) || [])[1];
            if (period && !draws.find(d => d.period === period)) {
              draws.push({
                period,
                date: dateMatch[1],
                main: nums.slice(0, 6).sort((a,b)=>a-b),
                special: nums[6]
              });
            }
          }
        }
      }

      if (draws.length >= 100) break;
      await new Promise(r => setTimeout(r, 300)); // 避免太快請求
    } catch(e) {
      console.log('第', page, '頁失敗:', e.message);
      break;
    }
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
