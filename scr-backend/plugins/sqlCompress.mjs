import { readFileSync } from 'fs';

const sqlTemplateStringPlugin = {
  name: 'sql-template-compressor',

  setup(build) {
    build.onLoad({ filter: /\.js$/ }, (args) => {
      const contents = readFileSync(args.path, 'utf8');
      
      const compressed = compressTemplateStrings(contents);
      
      return { contents: compressed, loader: 'js' };
    });
  }
};

function compressTemplateStrings(code) {
  let result = code;
  
  const templateRegex = /`([^`]*)`/g;
  
  result = result.replace(templateRegex, (match, content) => {
    if (!isSQLStatement(content)) {
      return match;
    }
    
    const compressed = compressSQLContent(content);
    
    if (compressed !== content && compressed.length < content.length) {
      return '`' + compressed + '`';
    }
    
    return match;
  });
  
  return result;
}

function isSQLStatement(content) {
  const sqlKeywords = [
    'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES',
    'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'ALTER',
    'DROP', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
    'ON', 'AND', 'OR', 'ORDER', 'BY', 'GROUP', 'HAVING',
    'LIMIT', 'OFFSET', 'UNION', 'AS', 'IN', 'NOT', 'NULL',
    'IS', 'LIKE', 'BETWEEN', 'EXISTS', 'CASE', 'WHEN',
    'THEN', 'ELSE', 'END', 'COUNT', 'SUM', 'AVG', 'MAX',
    'MIN', 'DISTINCT', 'ASC', 'DESC', 'PRIMARY', 'KEY',
    'FOREIGN', 'REFERENCES', 'AUTO_INCREMENT', 'DEFAULT',
    'ENGINE', 'CHARSET', 'COLLATE', 'INDEX', 'UNIQUE'
  ];
  
  const upperContent = content.toUpperCase().trim();
  
  if (upperContent.startsWith('--') || upperContent.startsWith('/*')) {
    return true;
  }
  
  for (const keyword of sqlKeywords) {
    if (upperContent.includes(keyword)) {
      const keywordIndex = upperContent.indexOf(keyword);
      const beforeKeyword = content.substring(0, keywordIndex).trim();
      if (beforeKeyword === '' || beforeKeyword.endsWith('(') || beforeKeyword.endsWith('\n')) {
        return true;
      }
    }
  }
  
  return false;
}

function compressSQLContent(content) {
  let result = content;
  
  result = result.replace(/--.*$/gm, '');
  
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');
  
  while (result.includes('\n\n')) {
    result = result.replace(/\n\n/g, '\n');
  }
  
  const lines = result.split('\n');
  const compressedLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trimEnd();
    
    if (line.trim() === '') {
      continue;
    }
    
    compressedLines.push(line);
  }
  
  result = compressedLines.join(' ');
  
  while (result.includes('  ')) {
    result = result.replace(/  /g, ' ');
  }
  
  result = result.trim();
  
  result = result.replace(/\(\s+/g, '(');
  result = result.replace(/\s+\)/g, ')');
  result = result.replace(/,\s+/g, ', ');
  result = result.replace(/\s+;/g, ';');
  result = result.replace(/;\s+/g, '; ');
  result = result.replace(/\{\s+/g, '{ ');
  result = result.replace(/\s+\}/g, ' }');
  
  return result;
}

export default sqlTemplateStringPlugin;

export { compressTemplateStrings, isSQLStatement, compressSQLContent };
