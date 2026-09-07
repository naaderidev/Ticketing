import "@testing-library/jest-dom";

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// Mock fetch
global.fetch = jest.fn();

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, "IntersectionObserver", {
  writable: true,
  value: MockIntersectionObserver,
});

// Mock ResizeObserver
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: MockResizeObserver,
});

// Mock URL.createObjectURL
URL.createObjectURL = jest.fn(() => "mock-url");
URL.revokeObjectURL = jest.fn();

// Mock Next.js Request and Response
class MockRequest {
  url: string;
  method: string;
  headers: Headers;
  body: any;

  constructor(url: string, init?: RequestInit) {
    this.url = url;
    this.method = init?.method || "GET";
    this.headers = new Headers(init?.headers);
    this.body = init?.body;
  }

  async json() {
    return JSON.parse(this.body);
  }
}

class MockNextResponse {
  status: number;
  body: any;

  constructor(body: any, init?: ResponseInit) {
    this.body = body;
    this.status = init?.status || 200;
  }

  static json(body: any, init?: ResponseInit) {
    return new MockNextResponse(body, init);
  }

  async json() {
    return this.body;
  }
}

// @ts-expect-error - Mocking global Request
global.Request = MockRequest;
// @ts-expect-error - Mocking global Response
global.Response = MockNextResponse;

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
