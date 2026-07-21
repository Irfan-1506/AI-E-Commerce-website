import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicService } from '../ai/anthropic.service';
import { RedisService } from '../redis/redis.service';
import { ProductsService } from '../products/products.service';
import { SemanticSearchService } from '../semantic-search/semantic-search.service';

const MAX_HISTORY_TURNS = 10; // cap token usage — a shopping chat doesn't need unlimited context
const SESSION_TTL_SECONDS = 60 * 60; // 1 hour of inactivity clears the session
const MAX_TOOL_ITERATIONS = 4; // hard cap on the agentic loop — never let a stuck loop run away

const SYSTEM_PROMPT = `You are a helpful shopping assistant for a Bangladesh e-commerce store.
You can search the product catalog and look up product details to help customers find what they need.
You CANNOT add items to a cart, place orders, or change prices — if a customer wants to buy something,
tell them to use the "Add to cart" button on the product page you point them to.
Keep replies concise (2-4 sentences) and mention specific product names when relevant.
Prices are in Bangladeshi Taka (৳). If you don't find a relevant product, say so honestly rather than
inventing one.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_products',
    description: 'Search the product catalog by meaning/intent (e.g. "something for a rainy commute"). Use this for most product questions.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'What the customer is looking for' } },
      required: ['query'],
    },
  },
  {
    name: 'get_product_details',
    description: 'Get full details (price, variants, stock, reviews) for a specific product by its slug.',
    input_schema: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug'],
    },
  },
];

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private anthropic: AnthropicService,
    private redis: RedisService,
    private products: ProductsService,
    private semanticSearch: SemanticSearchService,
  ) {}

  async chat(userId: string, userMessage: string) {
    const historyKey = `assistant:history:${userId}`;
    const history = (await this.redis.getJson<Anthropic.MessageParam[]>(historyKey)) ?? [];

    const messages: Anthropic.MessageParam[] = [...history, { role: 'user', content: userMessage }];
    const mentionedProducts: any[] = [];

    let iterations = 0;
    let finalText = '';

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++;
      const response = await this.anthropic.client.messages.create({
        model: this.anthropic.model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });

      const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

      if (toolUseBlocks.length === 0) {
        // No more tools requested — this is Claude's final answer.
        finalText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n');
        messages.push({ role: 'assistant', content: response.content });
        break;
      }

      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        const result = await this.executeTool(block, mentionedProducts);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    if (!finalText) {
      finalText = "Sorry, I'm having trouble finding an answer right now — try rephrasing your question.";
    }

    // Trim and persist history for the next turn.
    const trimmed = messages.slice(-MAX_HISTORY_TURNS * 2);
    await this.redis.setJson(historyKey, trimmed, SESSION_TTL_SECONDS);

    return { reply: finalText, products: dedupeById(mentionedProducts) };
  }

  async clearHistory(userId: string) {
    await this.redis.del(`assistant:history:${userId}`);
  }

  private async executeTool(block: Anthropic.ToolUseBlock, mentionedProducts: any[]): Promise<unknown> {
    try {
      if (block.name === 'search_products') {
        const { query } = block.input as { query: string };
        const { items } = await this.semanticSearch.search(query, 5);
        mentionedProducts.push(...items);
        return items.map((p: any) => ({ name: p.name, slug: p.slug, price: p.basePrice }));
      }
      if (block.name === 'get_product_details') {
        const { slug } = block.input as { slug: string };
        const product = await this.products.getBySlug(slug);
        mentionedProducts.push(product);
        return {
          name: product.name,
          description: product.description,
          variants: product.variants.map((v: any) => ({
            attributes: v.attributes,
            price: v.price,
            inStock: (v.inventory?.quantity ?? 0) > 0,
          })),
          reviewCount: product.reviews.length,
        };
      }
      return { error: 'Unknown tool' };
    } catch (err) {
      this.logger.warn(`Tool ${block.name} failed: ${(err as Error).message}`);
      return { error: 'Lookup failed' };
    }
  }
}

function dedupeById(items: any[]) {
  const seen = new Map();
  for (const item of items) seen.set(item.id, item);
  return Array.from(seen.values());
}
