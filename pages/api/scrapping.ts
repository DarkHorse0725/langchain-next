import type { NextApiRequest, NextApiResponse } from 'next';
import { OpenAIEmbeddings } from 'langchain/embeddings';
import { PineconeStore } from 'langchain/vectorstores';
import { makeChain } from '@/utils/makechain';
import { pinecone } from '@/utils/pinecone-client';

import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { CharacterTextSplitter } from 'langchain/text_splitter';
import { CustomPDFLoader } from '@/utils/customPDFLoader';
import { PINECONE_INDEX_NAME, PINECONE_NAME_SPACE } from '@/config/pinecone';
import { DirectoryLoader } from 'langchain/document_loaders';

import axios from 'axios';
import * as cheerio from 'cheerio';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { site_url } = req.body;

 

  if (!site_url) {
    return res.status(400).json({ message: 'Send url for scrapping' });
  }

  console.log('start scrapping ...');
  const result = await axios.post(
    'https://us-central1-phonic-jetty-356702.cloudfunctions.net/scrappingURL',
    {
      site_url: site_url,
    },
  );

  const response = await axios.get(site_url);
  const html = response.data;

  const removedScriptTagText = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  const $ = cheerio.load(removedScriptTagText);

  const _text = $('body').text().trim();

  let temp = _text.split('\n');
  let content = '';
  for (let j = 0; j < temp.length; j++) {
    if (temp[j].length < 20) continue;
    content += temp[j].trim();
  }

  console.log('content = ', content.length);

  // const scrappedText = result.data.content;
  const scrappedText = content;
  console.log('scrappedText = ', scrappedText.length);
  try {
    /* Split text into chunks */
    const textSplitter = new CharacterTextSplitter({
      separator: '.',
      chunkSize: 1000,
      chunkOverlap: 500,
    });

    const docs = await textSplitter.splitText(scrappedText);
    console.log('split docs', docs.length);

    console.log('creating vector store...');
    /*create and store the embeddings in the vectorStore*/
    const embeddings = new OpenAIEmbeddings();
    console.log('pinecone indexing ...');
    const index = pinecone.Index(PINECONE_INDEX_NAME); //change to your own index name

    console.log('pinecone embedding ... ');
    //embed text
    await PineconeStore.fromTexts(
      docs,
      [{metadata : site_url }],
      embeddings,
      {
        pineconeIndex: index,
        namespace: PINECONE_NAME_SPACE,
        textKey: 'text',
      },
    );
    res.send({ status: 'success', data: 'success' });
  } catch (error) {
    console.log('error', error);
    console.log('error', (error as any).response.data);
    res.send({ status: 'error', data: (error as any).response.data });
    throw new Error('Failed to ingest your data');
  }
}
