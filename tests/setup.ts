import '@testing-library/jest-dom'

// Mock Firebase
global.fetch = fetch
// Note: crypto is already available in Node.js global scope

// Mock Firebase Authentication
const mockAuth = {
  currentUser: null,
  onAuthStateChanged: vi.fn(),
  signOut: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
}

// Mock Firebase Firestore
const mockFirestore = {
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  addDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
}

// Mock Firebase Storage
const mockStorage = {
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  deleteObject: vi.fn(),
}

// Mock modules
vi.mock('../src/firebase', () => ({
  auth: mockAuth,
  db: mockFirestore,
  storage: mockStorage,
}))

// Mock crypto operations
vi.mock('../src/crypto/hpkeCrypto', () => ({
  generateKeyPair: vi.fn(),
  encryptData: vi.fn(),
  decryptData: vi.fn(),
  encryptForMultipleRecipients: vi.fn(),
  decryptFileContent: vi.fn(),
  encryptMetadata: vi.fn(),
  decryptMetadata: vi.fn(),
  hexToBytes: vi.fn(),
  bytesToHex: vi.fn(),
}))

vi.mock('../src/crypto/postQuantumCrypto', () => ({
  encryptString: vi.fn(),
  decryptString: vi.fn(),
  encryptMetadata: vi.fn(),
  decryptMetadata: vi.fn(),
  generateKeyPair: vi.fn(),
}))

// Mock React Router
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/', search: '' }),
  Link: ({ children, to }: any) => ({ type: 'a', props: { href: to, children } }),
  BrowserRouter: ({ children }: any) => ({ type: 'div', props: { children } }),
  Routes: ({ children }: any) => ({ type: 'div', props: { children } }),
  Route: ({ element }: any) => ({ type: 'div', props: { children: element } }),
}))