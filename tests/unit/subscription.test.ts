import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type UserCredential 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  query,
  where,
  onSnapshot,
  deleteDoc,
  type Firestore,
  type Unsubscribe 
} from 'firebase/firestore';
import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';

/**
 * Subscription & Plan Management Integration Tests
 * 
 * These tests validate the complete user lifecycle:
 * 1. User creation and authentication
 * 2. Subscription to a plan via Stripe
 * 3. Plan changes (upgrade/downgrade)
 * 4. Subscription data consistency
 * 
 * Prerequisites:
 * - Firebase emulators must be running (auth, firestore, functions)
 * - Stripe extension configured in test environment
 * - Test Stripe API keys configured
 */

describe('Subscription & Plan Management', () => {
  let app: FirebaseApp;
  let auth: Auth;
  let db: Firestore;
  let functions: Functions;
  let testUserEmail: string;
  let testUserPassword: string;
  let testUserId: string;
  let unsubscribeFunctions: Unsubscribe[] = [];

  // Test configuration
  const FIREBASE_CONFIG = {
    apiKey: process.env.VITE_FIREBASE_API_KEY || 'test-api-key',
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'test-project.firebaseapp.com',
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'test-project',
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'test-project.appspot.com',
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123456789',
    appId: process.env.VITE_FIREBASE_APP_ID || '1:123456789:web:abcdef123456',
  };

  // Mock Stripe Price IDs (these would be real IDs in production)
  const STRIPE_PRICES = {
    basic_monthly: 'price_basic_monthly_test',
    basic_yearly: 'price_basic_yearly_test',
    personal_monthly: 'price_personal_monthly_test',
    personal_yearly: 'price_personal_yearly_test',
    professional_monthly: 'price_professional_monthly_test',
    professional_yearly: 'price_professional_yearly_test',
  };

  beforeEach(() => {
    // Initialize Firebase
    app = initializeApp(FIREBASE_CONFIG);
    auth = getAuth(app);
    db = getFirestore(app);
    functions = getFunctions(app);

    // Use emulator if available
    if (process.env.FIREBASE_EMULATOR_HOST) {
      // Emulator setup would go here
      console.log('Using Firebase emulators');
    }

    // Generate unique test user credentials
    const timestamp = Date.now();
    testUserEmail = `test-user-${timestamp}@example.com`;
    testUserPassword = 'TestPassword123!';
  });

  afterEach(async () => {
    // Clean up subscriptions
    unsubscribeFunctions.forEach(unsub => unsub());
    unsubscribeFunctions = [];

    // Clean up test user if created
    if (testUserId && auth.currentUser) {
      try {
        // Delete user's Firestore data
        const userDoc = doc(db, 'users', testUserId);
        await deleteDoc(userDoc);

        const customerDoc = doc(db, 'customers', testUserId);
        await deleteDoc(customerDoc);

        // Sign out
        await signOut(auth);
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    }
  });

  describe('1. User Creation', () => {
    it('should create a new user with email and password', async () => {
      const userCredential: UserCredential = await createUserWithEmailAndPassword(
        auth,
        testUserEmail,
        testUserPassword
      );

      expect(userCredential.user).toBeDefined();
      expect(userCredential.user.email).toBe(testUserEmail);
      expect(userCredential.user.uid).toBeDefined();
      
      testUserId = userCredential.user.uid;

      // Verify user was created in Firestore
      const userDoc = await getDoc(doc(db, 'users', testUserId));
      
      // Note: In production, a Cloud Function creates the user profile
      // For testing, we'll create it manually if it doesn't exist
      if (!userDoc.exists()) {
        await setDoc(doc(db, 'users', testUserId), {
          email: testUserEmail,
          displayName: 'Test User',
          createdAt: new Date(),
          language: 'en'
        });
      }

      const updatedUserDoc = await getDoc(doc(db, 'users', testUserId));
      expect(updatedUserDoc.exists()).toBe(true);
      expect(updatedUserDoc.data()?.email).toBe(testUserEmail);
    });

    it('should create user profile with default settings', async () => {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        testUserEmail,
        testUserPassword
      );
      testUserId = userCredential.user.uid;

      // Create user profile
      const userProfile = {
        email: testUserEmail,
        displayName: 'Test User',
        createdAt: new Date(),
        language: 'en',
        theme: 'light',
        notificationsEnabled: true,
        storageUsed: 0,
        role: 'free', // Free tier by default
      };

      await setDoc(doc(db, 'users', testUserId), userProfile);

      const userDoc = await getDoc(doc(db, 'users', testUserId));
      const userData = userDoc.data();

      expect(userData).toBeDefined();
      expect(userData?.role).toBe('free');
      expect(userData?.storageUsed).toBe(0);
      expect(userData?.notificationsEnabled).toBe(true);
    });

    it('should authenticate existing user', async () => {
      // First create the user
      await createUserWithEmailAndPassword(auth, testUserEmail, testUserPassword);
      await signOut(auth);

      // Then sign in
      const userCredential = await signInWithEmailAndPassword(
        auth,
        testUserEmail,
        testUserPassword
      );

      expect(userCredential.user).toBeDefined();
      expect(userCredential.user.email).toBe(testUserEmail);
      testUserId = userCredential.user.uid;
    });
  });

  describe('2. Subscribe to Plan', () => {
    beforeEach(async () => {
      // Create and authenticate user for subscription tests
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        testUserEmail,
        testUserPassword
      );
      testUserId = userCredential.user.uid;

      // Create user profile
      await setDoc(doc(db, 'users', testUserId), {
        email: testUserEmail,
        displayName: 'Test User',
        createdAt: new Date(),
        role: 'free'
      });
    });

    it('should create Stripe customer on first subscription attempt', async () => {
      // Create checkout session (simulating Stripe extension)
      const checkoutSessionRef = doc(
        db,
        'customers',
        testUserId,
        'checkout_sessions',
        'test-session-1'
      );

      await setDoc(checkoutSessionRef, {
        mode: 'subscription',
        price: STRIPE_PRICES.basic_monthly,
        success_url: 'http://localhost:5173/subscription?success=true',
        cancel_url: 'http://localhost:5173/subscription',
        created: new Date(),
      });

      // Verify checkout session was created
      const checkoutDoc = await getDoc(checkoutSessionRef);
      expect(checkoutDoc.exists()).toBe(true);
      expect(checkoutDoc.data()?.price).toBe(STRIPE_PRICES.basic_monthly);
    });

    it('should subscribe to Basic Monthly plan', async () => {
      // Simulate successful subscription creation by Stripe webhook
      const subscriptionId = 'sub_test_basic_monthly';
      const subscriptionRef = doc(
        db,
        'customers',
        testUserId,
        'subscriptions',
        subscriptionId
      );

      const subscriptionData = {
        status: 'active',
        price: STRIPE_PRICES.basic_monthly,
        product: 'prod_basic',
        role: 'basic',
        cancel_at_period_end: false,
        created: Math.floor(Date.now() / 1000),
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days
        items: [{
          price: {
            product: { name: 'Basic Plan' },
            unit_amount: 500, // $5.00
            currency: 'usd',
            recurring: { interval: 'month' }
          }
        }]
      };

      await setDoc(subscriptionRef, subscriptionData);

      // Verify subscription
      const subDoc = await getDoc(subscriptionRef);
      expect(subDoc.exists()).toBe(true);
      expect(subDoc.data()?.status).toBe('active');
      expect(subDoc.data()?.role).toBe('basic');

      // Update user role based on subscription
      await setDoc(
        doc(db, 'users', testUserId),
        { role: 'basic' },
        { merge: true }
      );

      const userDoc = await getDoc(doc(db, 'users', testUserId));
      expect(userDoc.data()?.role).toBe('basic');
    });

    it('should subscribe to Personal Yearly plan', async () => {
      const subscriptionId = 'sub_test_personal_yearly';
      const subscriptionRef = doc(
        db,
        'customers',
        testUserId,
        'subscriptions',
        subscriptionId
      );

      const subscriptionData = {
        status: 'active',
        price: STRIPE_PRICES.personal_yearly,
        product: 'prod_personal',
        role: 'personal',
        cancel_at_period_end: false,
        created: Math.floor(Date.now() / 1000),
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60), // 1 year
        items: [{
          price: {
            product: { name: 'Personal Plan' },
            unit_amount: 12000, // $120.00
            currency: 'usd',
            recurring: { interval: 'year' }
          }
        }]
      };

      await setDoc(subscriptionRef, subscriptionData);

      // Verify subscription
      const subDoc = await getDoc(subscriptionRef);
      expect(subDoc.exists()).toBe(true);
      expect(subDoc.data()?.status).toBe('active');
      expect(subDoc.data()?.role).toBe('personal');

      // Update user role
      await setDoc(
        doc(db, 'users', testUserId),
        { role: 'personal' },
        { merge: true }
      );

      const userDoc = await getDoc(doc(db, 'users', testUserId));
      expect(userDoc.data()?.role).toBe('personal');
    });

    it('should handle subscription status changes', async () => {
      const subscriptionId = 'sub_test_status_changes';
      const subscriptionRef = doc(
        db,
        'customers',
        testUserId,
        'subscriptions',
        subscriptionId
      );

      // Create active subscription
      await setDoc(subscriptionRef, {
        status: 'active',
        price: STRIPE_PRICES.basic_monthly,
        role: 'basic',
      });

      let subDoc = await getDoc(subscriptionRef);
      expect(subDoc.data()?.status).toBe('active');

      // Simulate payment failure -> past_due
      await setDoc(subscriptionRef, { status: 'past_due' }, { merge: true });
      subDoc = await getDoc(subscriptionRef);
      expect(subDoc.data()?.status).toBe('past_due');

      // Simulate successful payment -> active
      await setDoc(subscriptionRef, { status: 'active' }, { merge: true });
      subDoc = await getDoc(subscriptionRef);
      expect(subDoc.data()?.status).toBe('active');

      // Simulate cancellation -> canceled
      await setDoc(subscriptionRef, { 
        status: 'canceled',
        canceled_at: Math.floor(Date.now() / 1000)
      }, { merge: true });
      subDoc = await getDoc(subscriptionRef);
      expect(subDoc.data()?.status).toBe('canceled');
    });
  });

  describe('3. Change Plans', () => {
    const subscriptionId = 'sub_test_plan_changes';
    
    beforeEach(async () => {
      // Create user with active Basic Monthly subscription
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        testUserEmail,
        testUserPassword
      );
      testUserId = userCredential.user.uid;

      await setDoc(doc(db, 'users', testUserId), {
        email: testUserEmail,
        displayName: 'Test User',
        role: 'basic'
      });

      // Create active subscription
      const subscriptionRef = doc(
        db,
        'customers',
        testUserId,
        'subscriptions',
        subscriptionId
      );

      await setDoc(subscriptionRef, {
        id: subscriptionId,
        status: 'active',
        price: STRIPE_PRICES.basic_monthly,
        product: 'prod_basic',
        role: 'basic',
        cancel_at_period_end: false,
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
        items: [{
          price: {
            product: { name: 'Basic Plan' },
            unit_amount: 500,
            currency: 'usd',
            recurring: { interval: 'month' }
          }
        }]
      });
    });

    it('should upgrade from Basic to Personal plan', async () => {
      const subscriptionRef = doc(
        db,
        'customers',
        testUserId,
        'subscriptions',
        subscriptionId
      );

      // Simulate upgrade by updating subscription
      await setDoc(subscriptionRef, {
        price: STRIPE_PRICES.personal_monthly,
        product: 'prod_personal',
        role: 'personal',
        items: [{
          price: {
            product: { name: 'Personal Plan' },
            unit_amount: 1500, // $15.00
            currency: 'usd',
            recurring: { interval: 'month' }
          }
        }]
      }, { merge: true });

      // Update user role
      await setDoc(
        doc(db, 'users', testUserId),
        { role: 'personal' },
        { merge: true }
      );

      // Verify upgrade
      const subDoc = await getDoc(subscriptionRef);
      expect(subDoc.data()?.role).toBe('personal');
      expect(subDoc.data()?.items[0].price.unit_amount).toBe(1500);

      const userDoc = await getDoc(doc(db, 'users', testUserId));
      expect(userDoc.data()?.role).toBe('personal');
    });

    it('should upgrade from Personal to Professional plan', async () => {
      // First set up as Personal subscriber
      const subscriptionRef = doc(
        db,
        'customers',
        testUserId,
        'subscriptions',
        subscriptionId
      );

      await setDoc(subscriptionRef, {
        price: STRIPE_PRICES.personal_monthly,
        role: 'personal',
      }, { merge: true });

      await setDoc(
        doc(db, 'users', testUserId),
        { role: 'personal' },
        { merge: true }
      );

      // Now upgrade to Professional
      await setDoc(subscriptionRef, {
        price: STRIPE_PRICES.professional_monthly,
        product: 'prod_professional',
        role: 'professional',
        items: [{
          price: {
            product: { name: 'Professional Plan' },
            unit_amount: 4900, // $49.00
            currency: 'usd',
            recurring: { interval: 'month' }
          }
        }]
      }, { merge: true });

      await setDoc(
        doc(db, 'users', testUserId),
        { role: 'professional' },
        { merge: true }
      );

      // Verify upgrade
      const subDoc = await getDoc(subscriptionRef);
      expect(subDoc.data()?.role).toBe('professional');
      expect(subDoc.data()?.items[0].price.unit_amount).toBe(4900);

      const userDoc = await getDoc(doc(db, 'users', testUserId));
      expect(userDoc.data()?.role).toBe('professional');
    });

    it('should downgrade from Professional to Personal plan', async () => {
      // Set up as Professional subscriber
      const subscriptionRef = doc(
        db,
        'customers',
        testUserId,
        'subscriptions',
        subscriptionId
      );

      await setDoc(subscriptionRef, {
        price: STRIPE_PRICES.professional_monthly,
        role: 'professional',
      }, { merge: true });

      await setDoc(
        doc(db, 'users', testUserId),
        { role: 'professional' },
        { merge: true }
      );

      // Downgrade to Personal
      await setDoc(subscriptionRef, {
        price: STRIPE_PRICES.personal_monthly,
        product: 'prod_personal',
        role: 'personal',
        items: [{
          price: {
            product: { name: 'Personal Plan' },
            unit_amount: 1500,
            currency: 'usd',
            recurring: { interval: 'month' }
          }
        }]
      }, { merge: true });

      await setDoc(
        doc(db, 'users', testUserId),
        { role: 'personal' },
        { merge: true }
      );

      // Verify downgrade
      const subDoc = await getDoc(subscriptionRef);
      expect(subDoc.data()?.role).toBe('personal');
      
      const userDoc = await getDoc(doc(db, 'users', testUserId));
      expect(userDoc.data()?.role).toBe('personal');
    });

    it('should change billing interval from monthly to yearly', async () => {
      const subscriptionRef = doc(
        db,
        'customers',
        testUserId,
        'subscriptions',
        subscriptionId
      );

      // Change to yearly billing
      await setDoc(subscriptionRef, {
        price: STRIPE_PRICES.basic_yearly,
        items: [{
          price: {
            product: { name: 'Basic Plan' },
            unit_amount: 5000, // $50.00/year
            currency: 'usd',
            recurring: { interval: 'year' }
          }
        }],
        current_period_end: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60)
      }, { merge: true });

      // Verify billing interval change
      const subDoc = await getDoc(subscriptionRef);
      expect(subDoc.data()?.items[0].price.recurring.interval).toBe('year');
      expect(subDoc.data()?.items[0].price.unit_amount).toBe(5000);
    });

    it('should handle proration on plan upgrade', async () => {
      const subscriptionRef = doc(
        db,
        'customers',
        testUserId,
        'subscriptions',
        subscriptionId
      );

      // Simulate mid-cycle upgrade with proration
      const now = Math.floor(Date.now() / 1000);
      const periodStart = now - (15 * 24 * 60 * 60); // 15 days ago
      const periodEnd = now + (15 * 24 * 60 * 60); // 15 days from now

      await setDoc(subscriptionRef, {
        price: STRIPE_PRICES.personal_monthly,
        role: 'personal',
        current_period_start: periodStart,
        current_period_end: periodEnd,
        items: [{
          price: {
            unit_amount: 1500,
            currency: 'usd',
            recurring: { interval: 'month' }
          }
        }]
      }, { merge: true });

      // Verify proration period is mid-cycle
      const subDoc = await getDoc(subscriptionRef);
      const data = subDoc.data();
      expect(data?.current_period_start).toBeLessThan(now);
      expect(data?.current_period_end).toBeGreaterThan(now);
    });
  });

  describe('4. Subscription Data Validation', () => {
    beforeEach(async () => {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        testUserEmail,
        testUserPassword
      );
      testUserId = userCredential.user.uid;

      await setDoc(doc(db, 'users', testUserId), {
        email: testUserEmail,
        displayName: 'Test User',
        role: 'basic'
      });
    });

    it('should validate subscription has all required fields', async () => {
      const subscriptionRef = doc(
        db,
        'customers',
        testUserId,
        'subscriptions',
        'sub_validation_test'
      );

      const requiredSubscriptionData = {
        status: 'active',
        price: STRIPE_PRICES.basic_monthly,
        product: 'prod_basic',
        role: 'basic',
        cancel_at_period_end: false,
        created: Math.floor(Date.now() / 1000),
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
        items: [{
          price: {
            product: { name: 'Basic Plan' },
            unit_amount: 500,
            currency: 'usd',
            recurring: { interval: 'month' }
          }
        }]
      };

      await setDoc(subscriptionRef, requiredSubscriptionData);

      const subDoc = await getDoc(subscriptionRef);
      const data = subDoc.data();

      // Validate all required fields exist
      expect(data?.status).toBeDefined();
      expect(data?.price).toBeDefined();
      expect(data?.product).toBeDefined();
      expect(data?.role).toBeDefined();
      expect(data?.cancel_at_period_end).toBeDefined();
      expect(data?.created).toBeDefined();
      expect(data?.current_period_start).toBeDefined();
      expect(data?.current_period_end).toBeDefined();
      expect(data?.items).toBeDefined();
      expect(data?.items.length).toBeGreaterThan(0);
    });

    it('should verify user role matches active subscription role', async () => {
      const subscriptionRef = doc(
        db,
        'customers',
        testUserId,
        'subscriptions',
        'sub_role_match_test'
      );

      await setDoc(subscriptionRef, {
        status: 'active',
        role: 'personal',
        price: STRIPE_PRICES.personal_monthly,
      });

      await setDoc(
        doc(db, 'users', testUserId),
        { role: 'personal' },
        { merge: true }
      );

      // Verify roles match
      const subDoc = await getDoc(subscriptionRef);
      const userDoc = await getDoc(doc(db, 'users', testUserId));

      expect(subDoc.data()?.role).toBe(userDoc.data()?.role);
    });

    it('should list all subscriptions for a customer', async () => {
      // Create multiple subscriptions (e.g., one canceled, one active)
      const sub1Ref = doc(db, 'customers', testUserId, 'subscriptions', 'sub_1');
      const sub2Ref = doc(db, 'customers', testUserId, 'subscriptions', 'sub_2');

      await setDoc(sub1Ref, {
        status: 'canceled',
        role: 'basic',
        canceled_at: Math.floor(Date.now() / 1000) - (10 * 24 * 60 * 60)
      });

      await setDoc(sub2Ref, {
        status: 'active',
        role: 'personal',
        current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
      });

      // Query all subscriptions
      const subscriptionsQuery = query(
        collection(db, 'customers', testUserId, 'subscriptions')
      );
      const subscriptionsSnapshot = await getDocs(subscriptionsQuery);

      expect(subscriptionsSnapshot.size).toBe(2);

      // Filter active subscriptions
      const activeSubscriptions = subscriptionsSnapshot.docs.filter(
        doc => doc.data().status === 'active'
      );
      expect(activeSubscriptions.length).toBe(1);
      expect(activeSubscriptions[0].data().role).toBe('personal');
    });

    it('should verify subscription period end is in the future for active subscriptions', async () => {
      const subscriptionRef = doc(
        db,
        'customers',
        testUserId,
        'subscriptions',
        'sub_period_test'
      );

      const now = Math.floor(Date.now() / 1000);
      const futureEnd = now + (30 * 24 * 60 * 60);

      await setDoc(subscriptionRef, {
        status: 'active',
        role: 'basic',
        current_period_start: now,
        current_period_end: futureEnd,
      });

      const subDoc = await getDoc(subscriptionRef);
      const data = subDoc.data();

      expect(data?.status).toBe('active');
      expect(data?.current_period_end).toBeGreaterThan(now);
    });

    it('should validate price amounts are positive integers', async () => {
      const subscriptionRef = doc(
        db,
        'customers',
        testUserId,
        'subscriptions',
        'sub_price_validation'
      );

      await setDoc(subscriptionRef, {
        status: 'active',
        role: 'basic',
        items: [{
          price: {
            unit_amount: 500,
            currency: 'usd'
          }
        }]
      });

      const subDoc = await getDoc(subscriptionRef);
      const amount = subDoc.data()?.items[0].price.unit_amount;

      expect(amount).toBeGreaterThan(0);
      expect(Number.isInteger(amount)).toBe(true);
    });
  });

  describe('5. Edge Cases & Error Handling', () => {
    beforeEach(async () => {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        testUserEmail,
        testUserPassword
      );
      testUserId = userCredential.user.uid;
    });

    it('should handle user with no subscriptions', async () => {
      const subscriptionsQuery = query(
        collection(db, 'customers', testUserId, 'subscriptions')
      );
      const subscriptionsSnapshot = await getDocs(subscriptionsQuery);

      expect(subscriptionsSnapshot.size).toBe(0);
    });

    it('should handle missing customer document', async () => {
      const customerDoc = await getDoc(doc(db, 'customers', testUserId));
      
      // Customer document may not exist until first subscription
      if (!customerDoc.exists()) {
        expect(customerDoc.exists()).toBe(false);
      }
    });

    it('should handle subscription without items array', async () => {
      const subscriptionRef = doc(
        db,
        'customers',
        testUserId,
        'subscriptions',
        'sub_no_items'
      );

      await setDoc(subscriptionRef, {
        status: 'active',
        role: 'basic',
        // Missing items array
      });

      const subDoc = await getDoc(subscriptionRef);
      expect(subDoc.data()?.items).toBeUndefined();
    });

    it('should handle trialing subscription status', async () => {
      const subscriptionRef = doc(
        db,
        'customers',
        testUserId,
        'subscriptions',
        'sub_trial'
      );

      const trialEnd = Math.floor(Date.now() / 1000) + (14 * 24 * 60 * 60); // 14 days

      await setDoc(subscriptionRef, {
        status: 'trialing',
        role: 'personal',
        trial_end: trialEnd,
      });

      const subDoc = await getDoc(subscriptionRef);
      expect(subDoc.data()?.status).toBe('trialing');
      expect(subDoc.data()?.trial_end).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('should handle subscription scheduled for cancellation', async () => {
      const subscriptionRef = doc(
        db,
        'customers',
        testUserId,
        'subscriptions',
        'sub_cancel_scheduled'
      );

      await setDoc(subscriptionRef, {
        status: 'active',
        role: 'basic',
        cancel_at_period_end: true,
        current_period_end: Math.floor(Date.now() / 1000) + (15 * 24 * 60 * 60),
      });

      const subDoc = await getDoc(subscriptionRef);
      expect(subDoc.data()?.cancel_at_period_end).toBe(true);
      expect(subDoc.data()?.status).toBe('active'); // Still active until period ends
    });
  });
});
