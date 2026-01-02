/**
 * File: functions/src/index.ts
 * Deploy using: firebase deploy --only functions
 */

// Use the V1 API to ensure 'region' and 'onCall' are recognized
import * as functions from 'firebase-functions/v1'; 
import * as admin from 'firebase-admin';

// Define the expected input data structure and initialize services
interface DriverInputData {
    email: string;
    password: string;
    name: string;
    plate: string;
}

admin.initializeApp(); 
const db = admin.database();

/**
 * Callable function to register a new driver account.
 * Authorization Check: Only users with the custom claim 'role: admin' can call this.
 */
export const registerDriverByAdmin = functions.region('asia-southeast1')
  .runWith({ maxInstances: 10, timeoutSeconds: 30 }) 
  .https.onCall(
  async (data: DriverInputData, context: functions.https.CallableContext) => {
    
    // 1. AUTHORIZATION CHECK
    if (!context.auth || context.auth.token.role !== 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied', 
        'Only administrators can register new drivers.'
      );
    }
    
    // 2. INPUT VALIDATION
    const { email, password, name, plate } = data;
    if (!email || !password || !name || !plate || password.length < 6) {
      throw new functions.https.HttpsError(
        'invalid-argument', 
        'Missing or invalid required fields.'
      );
    }

    let userRecord: admin.auth.UserRecord;
    try {
      // 3. CREATE FIREBASE AUTH USER
      userRecord = await admin.auth().createUser({
        email: email.trim(),
        password: password,
        displayName: name.trim(),
        disabled: false,
      });

      // 4. SET CUSTOM CLAIM (DRIVER ROLE)
      await admin.auth().setCustomUserClaims(userRecord.uid, { role: 'driver' });
      
      // 5. WRITE DATA TO REALTIME DATABASE
      const driverData = {
        name: name.trim(),
        email: email.trim(),
        plate: plate.trim(),
        role: 'driver',
        createdAt: admin.database.ServerValue.TIMESTAMP,
        status: 'offline', 
      };
      
      await db.ref(`users/${userRecord.uid}`).set(driverData);

      // 6. SUCCESS RESPONSE 
      return { 
        success: true, 
        uid: userRecord.uid, 
        name: driverData.name,
      };

    } catch (error: any) {
      console.error('Driver Registration Error:', error);
      if (error.code === 'auth/email-already-in-use') {
        throw new functions.https.HttpsError(
          'already-exists', 
          'The provided email address is already in use by an existing user.'
        );
      }
      throw new functions.https.HttpsError(
        'internal', 
        'An internal error occurred during driver registration.',
        error.message
      );
    }
  }
);