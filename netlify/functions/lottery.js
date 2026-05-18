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

async function fetchHKData() {
  const draws = [];
  for (let page = 1; page <= 5; page++) {
    try {
      const url = `https://www.pilio.idv.tw/ltohk/listbbk.asp?indexpage=${page}&orderby=new`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
          'Accept-Language': 'zh-TW,zh;q=0.9',
          'Referer': 'https://www.pilio.idv.tw/'
        }
      });
      if (!res.ok) break;
      const buffer = await res.arrayBuffer();
      const decoder = new TextDecoder('big5');
      const html = decoder.decode(buffer);
      const re = /\|\s*\*?\*?(\d{3,4})\*?\*?\s*\|\s*\*?\*?(\d{4}\/\d{2}\/\d{2})\*?\*?\s*\|\s*\*?\*?([\d\s,]+)\*?\*?\s*\|\s*\*?\*?(\d+)\*?\*?\s*\|/g;
      let m;
      while ((m = re.exec(html)) !== null) {
        const main = m[3].replace(/,/g, ' ').trim().split(/\s+/).map(Number).filter(n => n >= 1 && n <= 49);
        const special = parseInt(m[4]);
        if (main.length === 6 && special >= 1 && special <= 49) {
          draws.push({ period: m[1], date: m[2], main: main.sort((a,b)=>a-b), special });
        }
      }
      if (draws.length >= 100) break;
    } catch(e) { break; }
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
