exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600'
  };

  const type = event.queryStringParameters?.type || 'lotto';
  const year = new Date().getFullYear() - 1911;

  try {
    let data = [];

    for (const y of [year, year - 1]) {
      const url = type === 'lotto'
        ? `https://www.taiwanlottery.com/lotto/result/lotto649/${y}.csv`
        : `https://www.taiwanlottery.com/lotto/result/super_lotto638/${y}.csv`;

      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible)',
            'Referer': 'https://www.taiwanlottery.com/'
          }
        });
        if (!res.ok) continue;
        const text = await res.text();
        const parsed = type === 'lotto' ? parseLottoCSV(text) : parsePowerCSV(text);
        data = [...parsed, ...data];
      } catch(e) {}
    }

    if (data.length === 0) {
      return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: '無法取得資料' }) };
    }

    data = data.slice(0, 100);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, count: data.length, data, updatedAt: new Date().toISOString() })
    };

  } catch(error) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: error.message }) };
  }
};

function parseLottoCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const results = [];
  for (const line of lines) {
    const cols = line.split(',').map(s => s.trim().replace(/\r/g, ''));
    if (cols[0] !== '大樂透') continue;
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
  const lines = text.split('\n').filter(l => l.trim());
  const results = [];
  for (const line of lines) {
    const cols = line.split(',').map(s => s.trim().replace(/\r/g, ''));
    if (cols[0] !== '威力彩') continue;
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
