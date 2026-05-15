// netlify/functions/lottery.js
// Netlify Function 格式

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, s-maxage=3600'
  };

  const type = event.queryStringParameters?.type || 'lotto';

  try {
    let data;
    if (type === 'lotto') {
      data = await fetchFrom9800('http://www.9800.com.tw/lotto649/drop.html', 'lotto');
    } else if (type === 'power') {
      data = await fetchFrom9800('http://www.9800.com.tw/lotto38/drop.html', 'power');
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: '類型錯誤' }) };
    }

    if (!data || data.length === 0) {
      return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: '解析失敗' }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, count: data.length, data, updatedAt: new Date().toISOString() })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};

async function fetchFrom9800(url, type) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; LotteryApp/1.0)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-TW,zh;q=0.9',
    }
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const buffer = await response.arrayBuffer();
  const decoder = new TextDecoder('big5');
  const html = decoder.decode(buffer);

  return type === 'lotto' ? parseLotto(html) : parsePower(html);
}

function parseLotto(html) {
  const draws = [];
  const re = /(\d{6})\D+(\d{4}-\d{2}-\d{2})[^|]+\|[^|]+\|\s*([\d\s]+)\+\s*(\d+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const main = m[3].trim().split(/\s+/).map(Number).filter(n => n >= 1 && n <= 49);
    const special = parseInt(m[4]);
    if (main.length === 6 && special >= 1 && special <= 49) {
      draws.push({ period: m[1], date: m[2], main: main.sort((a,b)=>a-b), special });
    }
  }
  return draws;
}

function parsePower(html) {
  const draws = [];
  const re = /(\d{6})\D+(\d{4}-\d{2}-\d{2})[^|]+\|[^|]+\|\s*([\d\s]+)\+\s*(\d+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const main = m[3].trim().split(/\s+/).map(Number).filter(n => n >= 1 && n <= 38);
    const bonus = parseInt(m[4]);
    if (main.length === 6 && bonus >= 1 && bonus <= 8) {
      draws.push({ period: m[1], date: m[2], main: main.sort((a,b)=>a-b), bonus });
    }
  }
  return draws;
}
