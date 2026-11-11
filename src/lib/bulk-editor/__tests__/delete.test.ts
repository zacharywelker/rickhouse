import { describe, expect, it } from "vitest";
import { deleteSentence, idsOfKeys, keyOf } from "../delete";

describe("what the confirmation says", () => {
  it("names a label's bottles: 'Delete 2 labels and the 5 bottles on them.'", () => {
    expect(deleteSentence({ labelIds: [1, 2], bottleIds: [] }, { labels: 2, bottlesOnLabels: 5, bottles: 0 })).toEqual({
      title: "Delete 2 labels?",
      body: "Delete 2 labels and the 5 bottles on them.",
    });
  });
  it("says it, in the singular, for one label and one bottle", () => {
    expect(deleteSentence({ labelIds: [1], bottleIds: [] }, { labels: 1, bottlesOnLabels: 1, bottles: 0 }).body).toBe("Delete 1 label and the 1 bottle on it.");
  });
  it("says plainly when a label has no bottles", () => {
    expect(deleteSentence({ labelIds: [1], bottleIds: [] }, { labels: 1, bottlesOnLabels: 0, bottles: 0 }).body).toBe("Delete 1 label. There are no bottles on it.");
  });
  it("for bottles: only the bottles go, and the label stays even if it was the last", () => {
    const s = deleteSentence({ labelIds: [], bottleIds: [1, 2, 3] }, { labels: 0, bottlesOnLabels: 0, bottles: 3 });
    expect(s.title).toBe("Delete 3 bottles?");
    expect(s.body).toBe("Delete 3 bottles. Their labels stay, even if one was the last bottle on its label.");
    expect(deleteSentence({ labelIds: [], bottleIds: [1] }, { labels: 0, bottlesOnLabels: 0, bottles: 1 }).body).toBe("Delete 1 bottle. Its label stays, even if this was the last bottle on it.");
  });
  it("uses what the server counted, not what was ticked", () => {
    // Two ticked, but one is already gone.
    expect(deleteSentence({ labelIds: [1, 2], bottleIds: [] }, { labels: 1, bottlesOnLabels: 3, bottles: 0 }).title).toBe("Delete 1 label?");
  });
});

describe("row keys", () => {
  it("turn into ids: b is a bottle, l is a label", () => {
    expect(idsOfKeys(["b12", "l7", "b3"])).toEqual({ labelIds: [7], bottleIds: [12, 3] });
    expect(idsOfKeys([])).toEqual({ labelIds: [], bottleIds: [] });
  });
  it("come back from what the server could not delete", () => {
    expect(keyOf("label", 7)).toBe("l7");
    expect(keyOf("bottle", 12)).toBe("b12");
  });
});
