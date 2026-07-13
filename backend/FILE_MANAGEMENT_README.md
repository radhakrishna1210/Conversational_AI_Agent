# File Management System

## Overview

The File Management System provides a comprehensive solution for handling file operations in the Conversational AI Agent backend. This module enables secure file uploads, storage, retrieval, and management with support for multiple file types and comprehensive error handling.

## Features

- **File Upload**: Upload files with validation and storage
- **File Retrieval**: Download and access stored files
- **File Deletion**: Remove files with proper cleanup
- **File Listing**: Browse and search uploaded files
- **File Metadata**: Track file information and usage statistics
- **Security**: Built-in validation and access control
- **Error Handling**: Comprehensive error messages and logging

## Directory Structure

```
backend/
├── uploads/          # Main directory for uploaded files
├── src/
│   ├── routes/      # API endpoints for file operations
│   ├── controllers/ # Business logic for file management
│   ├── services/    # File service layer
│   ├── validators/  # Input validation
│   └── middleware/  # File handling middleware
└── FILE_MANAGEMENT_README.md  # This file
```

## API Endpoints

### Upload File
```
POST /api/files/upload
Content-Type: multipart/form-data

Parameters:
- file (required): The file to upload
- category (optional): File category/type
```

**Response:**
```json
{
  "success": true,
  "fileId": "unique-file-id",
  "filename": "document.pdf",
  "size": 1024,
  "uploadedAt": "2026-06-05T10:30:00Z"
}
```

### List Files
```
GET /api/files
Query Parameters:
- category (optional): Filter by category
- limit (optional): Maximum number of files to return
- offset (optional): Pagination offset
```

**Response:**
```json
{
  "success": true,
  "total": 10,
  "files": [
    {
      "fileId": "unique-file-id",
      "filename": "document.pdf",
      "size": 1024,
      "uploadedAt": "2026-06-05T10:30:00Z",
      "category": "documents"
    }
  ]
}
```

### Download File
```
GET /api/files/:fileId
```

**Response:**
- File binary data with appropriate headers

### Delete File
```
DELETE /api/files/:fileId
```

**Response:**
```json
{
  "success": true,
  "message": "File deleted successfully"
}
```

### Get File Info
```
GET /api/files/:fileId/info
```

**Response:**
```json
{
  "success": true,
  "file": {
    "fileId": "unique-file-id",
    "filename": "document.pdf",
    "size": 1024,
    "uploadedAt": "2026-06-05T10:30:00Z",
    "category": "documents",
    "mimeType": "application/pdf"
  }
}
```

## Supported File Types

- Documents: `.pdf`, `.doc`, `.docx`, `.txt`, `.xlsx`
- Images: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`
- Audio: `.mp3`, `.wav`, `.m4a`, `.ogg`
- Video: `.mp4`, `.avi`, `.mov`, `.webm`
- Archives: `.zip`, `.rar`, `.tar`, `.gz`

## Configuration

Set these environment variables in `.env`:

```
FILE_UPLOAD_DIR=./uploads
MAX_FILE_SIZE=104857600
ALLOWED_EXTENSIONS=pdf,doc,docx,txt,jpg,png,mp3,wav,mp4
FILE_STORAGE_TYPE=local
```

## Usage Examples

### Node.js/Express

```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('category', 'documents');

const response = await fetch('/api/files/upload', {
  method: 'POST',
  body: formData
});

const data = await response.json();
console.log('File uploaded:', data.fileId);
```

### cURL

```bash
curl -X POST http://localhost:3000/api/files/upload \
  -F "file=@document.pdf" \
  -F "category=documents"
```

### Download File

```javascript
const response = await fetch(`/api/files/${fileId}`);
const blob = await response.blob();

const url = window.URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'document.pdf';
a.click();
```

## Error Handling

Common error codes:

| Code | Message | Solution |
|------|---------|----------|
| 400 | Bad Request | Check request parameters |
| 413 | Payload Too Large | File exceeds size limit |
| 415 | Unsupported Media Type | File type not allowed |
| 404 | Not Found | File doesn't exist |
| 500 | Internal Server Error | Server error - check logs |

## Security Considerations

1. **File Validation**: All files are validated for type and size
2. **Access Control**: Implement proper authentication and authorization
3. **Sanitization**: Filenames are sanitized to prevent path traversal
4. **Virus Scanning**: Consider implementing virus scanning for production
5. **Encryption**: Store sensitive files in encrypted format
6. **Rate Limiting**: Implement rate limiting on upload endpoints

## Performance Tips

- Use compression for large files
- Implement caching for frequently accessed files
- Consider CDN for file delivery
- Monitor upload/download speeds
- Clean up temporary files regularly

## Troubleshooting

### File Upload Fails
- Check file size limit configuration
- Verify file type is in allowed list
- Ensure upload directory exists and is writable

### File Not Found
- Verify fileId is correct
- Check if file was successfully uploaded
- Review logs for deletion events

### Permission Denied
- Check file system permissions
- Verify user has correct authorization level

## Future Enhancements

- [ ] Cloud storage integration (S3, Google Drive)
- [ ] File versioning system
- [ ] Advanced search and filtering
- [ ] File sharing and collaboration
- [ ] Automatic backup and recovery
- [ ] File compression utilities
- [ ] OCR for document scanning

## Contributing

For bug reports or feature requests, please contact the development team or create an issue in the repository.

## License

This module is part of the Conversational AI Agent project and follows the project's license.

---

Last Updated: June 5, 2026
