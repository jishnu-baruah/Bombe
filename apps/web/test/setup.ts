import "@testing-library/jest-dom";

// jsdom has no IntersectionObserver; the landing sections use it for
// scroll-reveal. A no-op stub keeps render-level tests working.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

if (typeof globalThis.IntersectionObserver === "undefined") {
  // @ts-expect-error -- minimal stub, jsdom provides no implementation
  globalThis.IntersectionObserver = IntersectionObserverStub;
}
