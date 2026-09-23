import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { FileUpload } from "@/components/shared/file-upload";

class MockXMLHttpRequest {
  static instances: MockXMLHttpRequest[] = [];

  readonly upload: { onprogress: ((event: ProgressEvent) => void) | null } = {
    onprogress: null,
  };
  status = 0;
  responseText = "";
  requestBody: Document | XMLHttpRequestBodyInit | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    MockXMLHttpRequest.instances.push(this);
  }

  open = jest.fn();

  send = jest.fn((body?: Document | XMLHttpRequestBodyInit | null) => {
    this.requestBody = body ?? null;
  });
}

describe("FileUpload", () => {
  beforeEach(() => {
    MockXMLHttpRequest.instances = [];
    Object.defineProperty(window, "XMLHttpRequest", {
      configurable: true,
      writable: true,
      value: MockXMLHttpRequest,
    });
  });

  it("rejects an empty file before sending a request", () => {
    const { container } = render(<FileUpload onUpload={jest.fn()} />);
    const input = container.querySelector<HTMLInputElement>("input[type=file]");
    expect(input).not.toBeNull();

    fireEvent.change(input!, {
      target: { files: [new File([], "empty.txt", { type: "text/plain" })] },
    });

    expect(screen.getByText("فایل خالی مجاز نیست")).toBeInTheDocument();
    expect(MockXMLHttpRequest.instances).toHaveLength(0);
  });

  it("sends a non-empty file and reports the pending upload", () => {
    const onUpload = jest.fn();
    const { container } = render(<FileUpload onUpload={onUpload} />);
    const input = container.querySelector<HTMLInputElement>("input[type=file]");
    expect(input).not.toBeNull();

    const file = new File(["hello"], "note.txt", { type: "text/plain" });
    fireEvent.change(input!, { target: { files: [file] } });

    const request = MockXMLHttpRequest.instances[0];
    expect(request).toBeDefined();
    expect(request.open).toHaveBeenCalledWith("POST", "/api/upload");
    expect(request.requestBody).toBeInstanceOf(FormData);
    expect((request.requestBody as FormData).get("file")).toBe(file);

    request.status = 201;
    request.responseText = JSON.stringify({
      uploadId: "51c7142b-87d0-4e34-9a77-8c3df04fdbdc",
      fileName: "note.txt",
      fileType: "text/plain",
      fileSize: 5,
      expiresAt: "2026-09-14T00:00:00.000Z",
    });
    act(() => request.onload?.());

    expect(onUpload).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: "note.txt", fileSize: 5 })
    );
  });
});
