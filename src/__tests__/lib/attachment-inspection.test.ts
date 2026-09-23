import { inspectAttachment } from "@/lib/attachment-inspection";
import { errors } from "@/lib/strings";

describe("attachment content inspection", () => {
  it("derives image metadata from the signature instead of trusting the client", () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]);

    expect(inspectAttachment("../../تصویر.png", "image/png", png)).toEqual({
      fileName: "تصویر.png",
      fileSize: png.length,
      fileType: "image/png",
    });
  });

  it("rejects an executable renamed as an allowed image", () => {
    expect(() =>
      inspectAttachment("invoice.png", "image/png", Buffer.from("MZ executable"))
    ).toThrow(errors.FILE_CONTENT_INVALID);
  });

  it("rejects a declared media type that disagrees with verified content", () => {
    const pdf = Buffer.from("%PDF-1.7\n");

    expect(() => inspectAttachment("report.pdf", "image/png", pdf)).toThrow(
      errors.FILE_CONTENT_INVALID
    );
  });

  it("distinguishes OOXML document families using archive entries", () => {
    const fakeDocxDirectory = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from("word/document.xml"),
    ]);

    expect(
      inspectAttachment(
        "letter.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fakeDocxDirectory
      ).fileType
    ).toContain("wordprocessingml");
    expect(() =>
      inspectAttachment(
        "letter.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fakeDocxDirectory
      )
    ).toThrow(errors.FILE_CONTENT_INVALID);
  });

  it("rejects binary control bytes in text uploads", () => {
    expect(() =>
      inspectAttachment("payload.txt", "text/plain", Buffer.from([0x41, 0x00, 0x42]))
    ).toThrow(errors.FILE_CONTENT_INVALID);
  });
});
