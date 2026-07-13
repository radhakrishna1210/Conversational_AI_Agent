fetch('https://omnidim.io').then(r=>r.text()).then(t => {
  const fs = require('fs');
  fs.writeFileSync('omnidim_index.html', t);
}).catch(console.error);
