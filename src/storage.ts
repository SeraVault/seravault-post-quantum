import { ref, uploadBytes, getDownloadURL, getBytes } from 'firebase/storage';
import { storage } from './firebase';

// Upload a File object and return the storage path
export const uploadFile = async (file: File, pathPrefix: string): Promise<string> => {
  const fileName = `${Date.now()}_${file.name}`;
  const fullPath = `${pathPrefix}${fileName}`;
  const storageRef = ref(storage, fullPath);
  
  await uploadBytes(storageRef, file);
  return fullPath;
};

// Upload raw data to a specific path
export const uploadFileData = async (path: string, data: ArrayBuffer): Promise<void> => {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, data);
};

export const getFile = async (path: string): Promise<ArrayBuffer> => {
  const storageRef = ref(storage, path);
  return await getBytes(storageRef);
};
