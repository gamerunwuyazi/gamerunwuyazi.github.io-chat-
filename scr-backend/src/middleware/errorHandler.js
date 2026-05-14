import multer from 'multer';

function notFoundHandler(req, res, next) {
  res.status(404).json({
    status: 'error',
    message: 'API不存在'
  });
}

function globalErrorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    let errorMessage = '文件上传错误';

    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        errorMessage = '文件大小超过限制，最大支持5MB';
        break;
      case 'LIMIT_FILE_COUNT':
        errorMessage = '文件数量超过限制';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        errorMessage = `不支持的文件字段: ${err.field}`;
        break;
      case 'FILE_TYPE_NOT_ALLOWED':
        errorMessage = '不支持的文件类型';
        break;
      default:
        errorMessage = '文件上传格式错误';
    }

    return res.status(400).json({
      status: 'error',
      message: errorMessage
    });
  }

  console.error('全局错误捕获:', err.message);
  console.error('错误堆栈:', err.stack);

  res.status(500).json({
    status: 'error',
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
}

export {
  notFoundHandler,
  globalErrorHandler
};
