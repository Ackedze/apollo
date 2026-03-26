#!/bin/bash
set -euo pipefail
node build.js && node -e "const fs=require('fs');const path=require('path');const {getCatalogComponentsSnapshot}=require('./dist/reference/library');const tree=getCatalogComponentsSnapshot().map(c=>({name:c.name,key:c.key||null,role=c.role||'unknown',parent=c.parentComponent?.name||null,parentKey=c.parentComponent?.key||null}));fs.writeFileSync(path.resolve('./dist/componentTree.json'),JSON.stringify(tree,null,2));console.log('Component tree saved to dist/componentTree.json');"
