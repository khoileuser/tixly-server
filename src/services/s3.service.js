const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');

let s3Client;
let bucketName;

/**
 * Initialize S3 client
 */
const initS3 = (config) => {
  const credentials = {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  };

  // Add session token if provided (for temporary credentials)
  if (config.sessionToken) {
    credentials.sessionToken = config.sessionToken;
  }

  s3Client = new S3Client({
    region: config.region,
    credentials,
  });
  bucketName = config.s3BucketName;
};

/**
 * Upload an image to S3
 * @param {Buffer} fileBuffer - The file buffer
 * @param {string} fileName - Original file name
 * @param {string} mimeType - The MIME type of the file
 * @returns {Object} Upload result with URL
 */
const uploadImage = async (fileBuffer, fileName, mimeType) => {
  try {
    if (!s3Client || !bucketName) {
      throw new Error('S3 client not initialized');
    }

    // Generate unique file name
    const fileExtension = fileName.split('.').pop();
    const uniqueFileName = `events/${uuidv4()}.${fileExtension}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: uniqueFileName,
      Body: fileBuffer,
      ContentType: mimeType,
    });

    await s3Client.send(command);

    // Construct the public URL
    const imageUrl = `https://${bucketName}.s3.amazonaws.com/${uniqueFileName}`;

    return {
      success: true,
      data: {
        url: imageUrl,
        key: uniqueFileName,
      },
    };
  } catch (error) {
    console.error('Error uploading image to S3:', error);
    return {
      success: false,
      message: error.message || 'Failed to upload image',
    };
  }
};

/**
 * Delete an image from S3
 * @param {string} imageUrl - The full URL or key of the image
 * @returns {Object} Deletion result
 */
const deleteImage = async (imageUrl) => {
  try {
    if (!s3Client || !bucketName) {
      throw new Error('S3 client not initialized');
    }

    // Extract key from URL if full URL is provided
    let key = imageUrl;
    if (imageUrl.includes('.s3.amazonaws.com/')) {
      key = imageUrl.split('.s3.amazonaws.com/')[1];
    } else if (imageUrl.includes('.s3.')) {
      // Handle regional URLs like bucket.s3.region.amazonaws.com/key
      const parts = imageUrl.split('.amazonaws.com/');
      if (parts.length > 1) {
        key = parts[1];
      }
    }

    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    await s3Client.send(command);

    return {
      success: true,
      message: 'Image deleted successfully',
    };
  } catch (error) {
    console.error('Error deleting image from S3:', error);
    return {
      success: false,
      message: error.message || 'Failed to delete image',
    };
  }
};

/**
 * Generate a pre-signed URL for uploading
 * @param {string} fileName - The file name
 * @param {string} mimeType - The MIME type
 * @returns {Object} Pre-signed URL data
 */
const getUploadUrl = async (fileName, mimeType) => {
  try {
    if (!s3Client || !bucketName) {
      throw new Error('S3 client not initialized');
    }

    const fileExtension = fileName.split('.').pop();
    const uniqueFileName = `events/${uuidv4()}.${fileExtension}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: uniqueFileName,
      ContentType: mimeType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5 minutes

    return {
      success: true,
      data: {
        uploadUrl,
        key: uniqueFileName,
        publicUrl: `https://${bucketName}.s3.amazonaws.com/${uniqueFileName}`,
      },
    };
  } catch (error) {
    console.error('Error generating upload URL:', error);
    return {
      success: false,
      message: error.message || 'Failed to generate upload URL',
    };
  }
};

module.exports = {
  initS3,
  uploadImage,
  deleteImage,
  getUploadUrl,
};
