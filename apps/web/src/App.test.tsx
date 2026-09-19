import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { submitQuery } from "./api";

vi.mock("./api", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api")>();
  return { ...original, submitQuery: vi.fn() };
});

vi.mock("./turnstile", () => ({
  TurnstileController: class {
    async init(): Promise<void> {}
    execute(): Promise<string> {
      return Promise.resolve("test-token");
    }
    destroy(): void {}
  },
}));

const mockedSubmitQuery = vi.mocked(submitQuery);

describe("App", () => {
  beforeEach(() => {
    mockedSubmitQuery.mockReset();
  });

  it("keeps the input open for clarification and locks it after an answer", async () => {
    mockedSubmitQuery
      .mockResolvedValueOnce({ kind: "clarification", text: "どこの天気ですか？" })
      .mockResolvedValueOnce({ kind: "answer", text: "晴れ" });
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByLabelText("質問");
    await user.type(input, "明日の天気は？");
    await user.click(screen.getByRole("button", { name: "送信" }));
    const clarificationCopies = await screen.findAllByText("どこの天気ですか？");
    expect(clarificationCopies[0]).toBeVisible();
    expect(input).toBeEnabled();

    await user.type(input, "東京都港区");
    await user.click(screen.getByRole("button", { name: "送信" }));
    const answerCopies = await screen.findAllByText("晴れ");
    expect(answerCopies[0]).toBeVisible();
    expect(input).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "新しい検索" }));
    expect(input).toBeEnabled();
    expect(screen.queryAllByText("晴れ")).toHaveLength(0);
  });

  it("prevents a second request while the first is pending", async () => {
    let resolveRequest: ((value: { kind: "answer"; text: string }) => void) | undefined;
    mockedSubmitQuery.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByLabelText("質問");
    await user.type(input, "メッシの年齢は？");
    await user.dblClick(screen.getByRole("button", { name: "送信" }));
    expect(mockedSubmitQuery).toHaveBeenCalledTimes(1);

    resolveRequest?.({ kind: "answer", text: "39歳" });
    await waitFor(() => expect(screen.getAllByText("39歳")[0]).toBeVisible());
  });

  it("renders user supplied markup as text", async () => {
    mockedSubmitQuery.mockResolvedValueOnce({ kind: "answer", text: "回答できません" });
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText("質問"), "<script>alert(1)</script>");
    await user.click(screen.getByRole("button", { name: "送信" }));
    expect(await screen.findByText("<script>alert(1)</script>")).toBeVisible();
    expect(document.querySelector("script:not([src])")).toBeNull();
  });
});
