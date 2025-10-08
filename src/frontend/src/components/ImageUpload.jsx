import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';

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
    awaitRefetchQueries: false, // Don't wait for refetch to complete
  });
  const [uploadImages] = useMutation(UPLOAD_IMAGES, {
    refetchQueries: [{ query: GET_IMAGES }],
    awaitRefetchQueries: false, // Don't wait for refetch to complete
  });

  const [uploading, setUploading] = useState(false);

  const onDrop = async (acceptedFiles) => {
    setUploading(true);

    try {
      if (acceptedFiles.length === 1) {
        await uploadImage({
          variables: { file: acceptedFiles[0] }
        });
      } else if (acceptedFiles.length > 1) {
        await uploadImages({
          variables: { files: acceptedFiles }
        });
      }
      alert(`Successfully uploaded ${acceptedFiles.length} image(s)`);
    } catch (error) {
      console.error('Upload error:', error);
      alert(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']
    },
    multiple: true,
    noClick: false,
    noKeyboard: false
  });

  return (
    <div {...getRootProps()} style={{ display: 'inline-block' }}>
      <input {...getInputProps()} />
      <button
        disabled={uploading}
        style={{
          padding: '8px 20px',
          background: uploading ? '#6c757d' : 'rgba(40, 167, 69, 0.9)',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontSize: '14px',
          fontWeight: '500',
          cursor: uploading ? 'not-allowed' : 'pointer',
          transition: 'background-color 0.2s',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
        onMouseEnter={(e) => {
          if (!uploading) e.target.style.background = 'rgba(33, 136, 56, 1)';
        }}
        onMouseLeave={(e) => {
          if (!uploading) e.target.style.background = 'rgba(40, 167, 69, 0.9)';
        }}
      >
        {uploading ? '⏳ Uploading...' : '📤 Upload Images'}
      </button>
    </div>
  );
};

export default ImageUpload;
