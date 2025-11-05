// 在浏览器控制台运行此脚本来查看数据库内容

// 1. 打开数据库
const dbName = 'FeedAIMuterDB';

const request = indexedDB.open(dbName);

request.onsuccess = function(event) {
  const db = event.target.result;
  console.log('✅ 数据库打开成功');
  console.log('数据库版本:', db.version);
  console.log('表名:', Array.from(db.objectStoreNames));
  
  // 查询 confirmedVisits 表
  const transaction = db.transaction(['confirmedVisits'], 'readonly');
  const store = transaction.objectStore('confirmedVisits');
  const getAllRequest = store.getAll();
  
  getAllRequest.onsuccess = function() {
    const visits = getAllRequest.result;
    console.log('📊 confirmedVisits 表数据:');
    console.log('总记录数:', visits.length);
    
    // 按 URL 分组统计
    const urlMap = new Map();
    visits.forEach(v => {
      const count = urlMap.get(v.url) || 0;
      urlMap.set(v.url, count + 1);
    });
    
    console.log('\n📍 按 URL 统计:');
    for (const [url, count] of urlMap.entries()) {
      console.log(`  ${url}: ${count} 条记录`);
    }
    
    console.log('\n📝 完整数据:');
    console.table(visits.map(v => ({
      url: v.url.substring(0, 50),
      title: v.title,
      duration: v.duration,
      visitTime: new Date(v.visitTime).toLocaleString(),
      source: v.source
    })));
  };
};

request.onerror = function() {
  console.error('❌ 打开数据库失败', request.error);
};
