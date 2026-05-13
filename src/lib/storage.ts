import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

export async function uploadFile(path: string, file: File): Promise<string> {
  const fileRef = ref(storage, path);
  
  console.log(`Starting resumable upload to path: ${path}`);
  
  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(fileRef, file);

    // 30s timeout
    const timeoutTimer = setTimeout(() => {
      uploadTask.cancel();
      reject(new Error('Firebase Storage upload timed out (30s). This usually means the Storage bucket is not provisioned or CORS is blocked. Please ensure Storage is enabled in the Firebase Console.'));
    }, 30000);

    uploadTask.on('state_changed', 
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        console.log('Upload is ' + progress + '% done');
      }, 
      (error) => {
        clearTimeout(timeoutTimer);
        console.error('Storage Upload Task Error:', error);
        if (error.code === 'storage/unauthorized') {
          reject(new Error('Upload failed: Unauthorized. You must manually deploy Storage rules in the Firebase Console.'));
        } else if (error.code === 'storage/canceled') {
          reject(new Error('Upload canceled (timeout).'));
        } else {
          reject(error);
        }
      }, 
      async () => {
        clearTimeout(timeoutTimer);
        console.log('Upload successful, getting download URL...');
        try {
          const downloadURL = await getDownloadURL(fileRef);
          resolve(downloadURL);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

export const getAvatarPath = (userId: string, fileName: string) => `users/${userId}/avatars/${fileName}`;
export const getAgentAvatarPath = (userId: string, agentId: string) => `users/${userId}/agents/${agentId}/avatar`;
