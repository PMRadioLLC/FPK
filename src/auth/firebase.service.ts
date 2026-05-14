import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private initialized = false;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');

    // Skip Firebase init if credentials are missing or placeholder values
    if (
      !projectId ||
      !privateKey ||
      !clientEmail ||
      projectId === 'placeholder' ||
      privateKey === 'placeholder' ||
      !privateKey.includes('BEGIN PRIVATE KEY')
    ) {
      this.logger.warn(
        'Firebase credentials not configured — auth endpoints will not work. ' +
        'Set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL in .env',
      );
      return;
    }

    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          privateKey: privateKey.replace(/\\n/g, '\n'),
          clientEmail,
        }),
        storageBucket: this.configService.get<string>('FIREBASE_STORAGE_BUCKET', 'fun-pizza-kitchen.firebasestorage.app'),
      });
      this.logger.log('Firebase Admin initialized');
    }
    // Mark initialized even if Admin was already set up by another instance.
    this.initialized = true;
  }

  /** Upload bytes to Firebase Storage server-side. Returns the public download URL. */
  async uploadFile(
    path: string,
    bytes: Buffer,
    contentType: string,
  ): Promise<string> {
    if (!this.initialized) {
      throw new Error('Firebase is not configured.');
    }
    const bucket = admin.storage().bucket();
    const file = bucket.file(path);
    await file.save(bytes, { contentType, public: true, resumable: false });
    return `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(path)}`;
  }

  /**
   * Verify a Firebase ID token sent from the mobile app.
   * Returns the decoded token with uid, email, etc.
   */
  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    if (!this.initialized) {
      throw new Error('Firebase is not configured. Set credentials in .env');
    }
    return admin.auth().verifyIdToken(idToken);
  }

  /**
   * Get a Firebase user by UID
   */
  async getUser(uid: string): Promise<admin.auth.UserRecord> {
    if (!this.initialized) {
      throw new Error('Firebase is not configured. Set credentials in .env');
    }
    return admin.auth().getUser(uid);
  }
}
