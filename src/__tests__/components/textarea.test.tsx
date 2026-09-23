import React, { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Textarea } from "@/components/ui/textarea";

function ControlledTextarea() {
  const [value, setValue] = useState("");
  return (
    <Textarea
      aria-label="شرح"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      maxLength={5}
    />
  );
}

describe("Textarea", () => {
  it("shows a Persian character counter and blocks characters beyond maxLength", async () => {
    const user = userEvent.setup();
    render(<ControlledTextarea />);

    const textarea = screen.getByLabelText("شرح");
    expect(screen.getByText("۰ / ۵")).toBeInTheDocument();

    await user.type(textarea, "123456");

    expect(textarea).toHaveValue("12345");
    expect(textarea).toHaveAttribute("maxlength", "5");
    expect(screen.getByText("۵ / ۵")).toBeInTheDocument();
  });
});
