const CITIES = [
  { code: 'CN-BJ', name: '北京', lat: 39.9042, lon: 116.4074 },
  { code: 'CN-SH', name: '上海', lat: 31.2304, lon: 121.4737 },
  { code: 'CN-GZ', name: '广州', lat: 23.1291, lon: 113.2644 },
  { code: 'CN-SZ', name: '深圳', lat: 22.5431, lon: 114.0579 },
  { code: 'CN-CD', name: '成都', lat: 30.5728, lon: 104.0668 },
  { code: 'CN-HZ', name: '杭州', lat: 30.2741, lon: 120.1551 },
  { code: 'CN-NJ', name: '南京', lat: 32.0603, lon: 118.7969 },
  { code: 'CN-WH', name: '武汉', lat: 30.5928, lon: 114.3055 },
  { code: 'CN-XA', name: '西安', lat: 34.3416, lon: 108.9398 },
  { code: 'CN-CQ', name: '重庆', lat: 29.563, lon: 106.5516 },
  { code: 'CN-TJ', name: '天津', lat: 39.0842, lon: 117.201 },
  { code: 'CN-SUZ', name: '苏州', lat: 31.2989, lon: 120.5853 },
  { code: 'CN-QD', name: '青岛', lat: 36.0671, lon: 120.3826 },
  { code: 'CN-XM', name: '厦门', lat: 24.4798, lon: 118.0894 },
  { code: 'CN-CS', name: '长沙', lat: 28.2282, lon: 112.9388 },
  { code: 'CN-ZZ', name: '郑州', lat: 34.7466, lon: 113.6254 },
  { code: 'CN-HF', name: '合肥', lat: 31.8206, lon: 117.2272 },
  { code: 'CN-SY', name: '沈阳', lat: 41.8057, lon: 123.4315 },
  { code: 'CN-KM', name: '昆明', lat: 25.0389, lon: 102.7183 },
  { code: 'CN-FZ', name: '福州', lat: 26.0745, lon: 119.2965 },
  { code: 'CN-JN', name: '济南', lat: 36.6512, lon: 117.1201 },
  { code: 'CN-HRB', name: '哈尔滨', lat: 45.8038, lon: 126.535 },
  { code: 'CN-URC', name: '乌鲁木齐', lat: 43.8256, lon: 87.6168 },
  { code: 'CN-NN', name: '南宁', lat: 22.817, lon: 108.3669 },
  { code: 'CN-NB', name: '宁波', lat: 29.8683, lon: 121.544 },
  { code: 'CN-DG', name: '东莞', lat: 23.0207, lon: 113.7518 },
  { code: 'CN-ZH', name: '珠海', lat: 22.271, lon: 113.5767 },
  { code: 'CN-HAK', name: '海口', lat: 20.044, lon: 110.1999 },
  { code: 'HK', name: '香港', lat: 22.3193, lon: 114.1694 },
  { code: 'TW-TPE', name: '台北', lat: 25.033, lon: 121.5654 },
  { code: 'JP-TYO', name: '东京', lat: 35.6762, lon: 139.6503 },
  { code: 'KR-SEL', name: '首尔', lat: 37.5665, lon: 126.978 },
  { code: 'SG', name: '新加坡', lat: 1.3521, lon: 103.8198 },
  { code: 'MY-KUL', name: '吉隆坡', lat: 3.139, lon: 101.6869 },
  { code: 'TH-BKK', name: '曼谷', lat: 13.7563, lon: 100.5018 },
  { code: 'AU-SYD', name: '悉尼', lat: -33.8688, lon: 151.2093 },
  { code: 'GB-LON', name: '伦敦', lat: 51.5072, lon: -0.1276 },
  { code: 'FR-PAR', name: '巴黎', lat: 48.8566, lon: 2.3522 },
  { code: 'US-NYC', name: '纽约', lat: 40.7128, lon: -74.006 },
  { code: 'US-LAX', name: '洛杉矶', lat: 34.0522, lon: -118.2437 },
  { code: 'CA-YVR', name: '温哥华', lat: 49.2827, lon: -123.1207 }
]

const CITY_BY_CODE = CITIES.reduce((result, city) => {
  result[city.code] = city
  return result
}, {})

module.exports = { CITIES, CITY_BY_CODE }
