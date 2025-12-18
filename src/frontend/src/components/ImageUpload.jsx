import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMutation } from '@apollo/client/react';
import { UPLOAD_IMAGE, UPLOAD_IMAGES, GET_IMAGES } from '../graphql/images';
import Notification from './Notification';

const ImageUpload = ({ onUploaded = null }) => {
  const [uploadImage] = useMutation(UPLOAD_IMAGE, {
    refetchQueries: [{ query: GET_IMAGES }],
    awaitRefetchQueries: false, // Don't wait for refetch to complete
  });
  const [uploadImages] = useMutation(UPLOAD_IMAGES, {
    refetchQueries: [{ query: GET_IMAGES }],
    awaitRefetchQueries: false, // Don't wait for refetch to complete
  });

  const [uploading, setUploading] = useState(false);
  const [notification, setNotification] = useState(null);
  const showNotification = (message, type = 'info', duration = 3000) => {
    setNotification({ message, type, duration });
  };

  const onDrop = async (acceptedFiles) => {
    setUploading(true);

    try {
      if (acceptedFiles.length === 1) {
        const res = await uploadImage({
          variables: { file: acceptedFiles[0] }
        });
        const uploaded = res?.data?.uploadImage || null;
        if (uploaded && typeof onUploaded === 'function') {
          onUploaded(uploaded);
        }
      } else if (acceptedFiles.length > 1) {
        await uploadImages({
          variables: { files: acceptedFiles }
        });
      }
      // Avoid a blocking alert for single-image uploads since we auto-open the editor.
      if (acceptedFiles.length !== 1) {
        showNotification(`Successfully uploaded ${acceptedFiles.length} image(s)`, 'success');
      }
    } catch (error) {
      console.error('Upload error:', error);
      showNotification(`Upload failed: ${error.message}`, 'error');
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
    maxFiles: 100,
    maxSize: 2147483648,
    noClick: false,
    noKeyboard: false
  });

  return (
    <div {...getRootProps()} style={{ display: 'inline-block' }}>
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          duration={notification.duration}
          onClose={() => setNotification(null)}
        />
      )}
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
