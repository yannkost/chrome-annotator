// Thin wrapper around chrome.storage.local with unlimitedStorage.
// Each annotation object is persisted inside a single array under ANNOTATION_KEY.
self.AnnotatorStore = (() => {
  const KEY = "annotations_v1";

  async function all() {
    const data = await chrome.storage.local.get(KEY);
    return data[KEY] || [];
  }

  async function commit(list) {
    await chrome.storage.local.set({ [KEY]: list });
  }

  return {
    async all() {
      return all();
    },

    async add(annotation) {
      const list = await all();
      list.push(annotation);
      await commit(list);
      return annotation;
    },

    async update(id, patch) {
      const list = await all();
      const i = list.findIndex((a) => a.id === id);
      if (i === -1) return null;
      list[i] = { ...list[i], ...patch };
      await commit(list);
      return list[i];
    },

    async remove(id) {
      const list = await all();
      await commit(list.filter((a) => a.id !== id));
    },

    async byUrl(url) {
      const list = await all();
      return list.filter((a) => a.url === url);
    },
  };
})();