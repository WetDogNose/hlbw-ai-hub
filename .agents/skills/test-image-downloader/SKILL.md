---
name: Test Image Downloader
description: Downloads real photos of storage containers from the internet for AI pipeline testing. Use this skill when the user needs fresh test images.
---

# Test Image Downloader

Generates high-quality AI test images of storage containers (good and bad examples) for stress-testing the extraction pipeline. Images are designed to be large enough to trigger the client-side compression algorithm.

## Instructions

When invoked, follow these steps:

1. **Read the prompt catalog** to see what images are available:

```bash
// turbo
node .agents/skills/test-image-downloader/scripts/generate-test-images.mjs
```

2. **Generate images** using the `generate_image` tool with prompts from the catalog script. Import the prompts:
   - Open `.agents/skills/test-image-downloader/scripts/generate-test-images.mjs`
   - Use the `IMAGE_PROMPTS.good` and `IMAGE_PROMPTS.bad` arrays
   - Call `generate_image` for each prompt (batch in parallel for speed)

3. **Copy generated images** to `public/test-images/`:

```bash
Copy-Item "path/to/generated/*.png" "public/test-images/"
```

4. **Verify** the images are large enough to trigger compression (should be >500 KB each).

5. **Report the results** to the user:
   - How many good vs bad images were generated
   - File sizes (should be 500 KB – 1 MB+ each)
   - Which pipeline edge cases are covered

## Image Categories

### Good (10 images) — Clear, well-lit, identifiable contents
| Image | Contents |
|-------|----------|
| `good_clear_clothing_box` | Sweater, shoes, book, cable, succulent |
| `good_organized_tools_bin` | Drill, screwdrivers, tape measure, gloves |
| `good_kitchen_items_box` | Plates, wine glasses, cutting board, whisk |
| `good_personal_items_box` | Framed photos, vase, DVDs, desk lamp |
| `good_kids_toys_container` | Fire truck, LEGO, teddy bear, crayons |
| `good_electronics_box` | Laptop, earbuds, hard drive, mouse, cables |
| `good_bathroom_supplies_box` | Towels, shampoo, toothpaste, first aid kit |
| `good_office_supplies_bin` | Stapler, pens, calculator, post-its |
| `good_camping_gear_box` | Sleeping bag, stove, headlamp, water bottle |
| `good_books_media_box` | Novels, vinyl record, headphones, Kindle |

### Bad (10 images) — Pipeline edge cases & challenges
| Image | Challenge |
|-------|-----------|
| `bad_blurry_motion_box` | Motion blur — camera shake |
| `bad_extremely_dark_box` | Near-total darkness |
| `bad_wrapped_items_box` | All items wrapped in newspaper/bubble wrap |
| `bad_overflowing_chaos_box` | Extreme clutter, items spilling out |
| `bad_glare_reflection_box` | Flash glare washing out contents |
| `bad_extreme_angle_box` | Extreme low angle, can't see inside |
| `bad_similar_items_box` | All items same color as box |
| `bad_partially_closed_box` | Flaps mostly covering contents |
| `bad_tiny_items_huge_box` | Tiny items lost in huge empty box |
| `bad_mixed_lighting_box` | Conflicting warm/cool light sources |

## Notes

- All images are PNG, generated at high quality (typically 500 KB – 850 KB each)
- Images are large enough to trigger the client-side compression algorithm
- The prompt catalog in `scripts/generate-test-images.mjs` can be extended with new prompts
- Generated images are saved to `public/test-images/`


> [!NOTE]
> **AI Swarming Hint:** If you are executing this workflow/skill as part of a larger or highly parallelizable task, explicitly evaluate whether you can hand off the work to the agent swarming system. Review `.agents/workflows/master-agent-coordinator.md` to act as a Master Agent and dispatch true-parallel sub-agents.
