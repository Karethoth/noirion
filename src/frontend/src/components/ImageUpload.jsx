import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMutation, gql } from '@apollo/client';

const UPLOAD_IMAGE = gql`
  mutation UploadImage($file: Upload!) {
    uploadImage(file: $file) {
      id
      filename
      filePath
      fileSize
      latitude
      longitude
      captureTimestamp
      uploadedAt
    }
  }
`;

const UPLOAD_IMAGES = gql`
  mutation UploadImages($files: [Upload!]!) {
    uploadImages(files: $files) {
      id
      filename
      filePath
      fileSize
      latitude
      longitude
      captureTimestamp
      uploadedAt
    }
  }
`;

const GET_IMAGES = gql`
  query GetImages {
    images {
      id
      filename
      filePath
      latitude
      longitude
      captureTimestamp
      cameraMake
      cameraModel
      uploadedAt
    }
  }
`;

const ImageUpload = () => {
  const [uploadImage] = useMutation(UPLOAD_IMAGE, {
    refetchQueries: [{ query: GET_IMAGES }],
  });
  const [uploadImages] = useMutation(UPLOAD_IMAGES, {
    refetchQueries: [{ query: GET_IMAGES }],
  });
  
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState([]);

  const onDrop = async (acceptedFiles) => {
    setUploading(true);
    setUploadResults([]);

    try {
      if (acceptedFiles.length === 1) {
        // Single file upload
        const result = await uploadImage({
          variables: {
            file: acceptedFiles[0]
          }
        });
        setUploadResults([result.data.uploadImage]);
      } else if (acceptedFiles.length > 1) {
        // Multiple file upload
        const result = await uploadImages({
          variables: {
            files: acceptedFiles
          }
        });
        setUploadResults(result.data.uploadImages);
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']
    },
    multiple: true
  });

  return (
    <div style={{ marginBottom: '20px' }}>
      <div
        {...getRootProps()}
        style={{
          border: '2px dashed #ccc',
          borderRadius: '8px',
          padding: '40px',
          textAlign: 'center',
          cursor: 'pointer',
          backgroundColor: isDragActive ? '#f0f8ff' : '#fafafa',
          borderColor: isDragActive ? '#007bff' : '#ccc',
          transition: 'all 0.3s ease'
        }}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <div>
            <div>📤 Uploading...</div>
            <div style={{ fontSize: '14px', color: '#666', marginTop: '10px' }}>
              Please wait while your images are being processed
            </div>
          </div>
        ) : isDragActive ? (
          <div>
            <div>📂 Drop the images here...</div>
          </div>
        ) : (
          <div>
            <div>📷 Drag & drop images here, or click to select</div>
            <div style={{ fontSize: '14px', color: '#666', marginTop: '10px' }}>
              Supports PNG, JPG, GIF, BMP, WebP. EXIF GPS data will be extracted automatically.
            </div>
          </div>
        )}
      </div>

      {uploadResults.length > 0 && (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#e8f5e8', borderRadius: '5px' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#2d5a2d' }}>✅ Upload Successful!</h3>
          {uploadResults.map((result) => (
            <div key={result.id} style={{ marginBottom: '10px', fontSize: '14px' }}>
              <strong>{result.filename}</strong>
              <div style={{ color: '#666' }}>
                Size: {(result.fileSize / 1024 / 1024).toFixed(2)} MB
                {result.latitude && result.longitude && (
                  <> • Location: {result.latitude.toFixed(6)}, {result.longitude.toFixed(6)}</>
                )}
                {result.captureTimestamp && (
                  <> • Captured: {new Date(result.captureTimestamp).toLocaleString()}</>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ImageUpload;