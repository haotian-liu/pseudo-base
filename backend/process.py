import pandas as pd
import numpy as np
import os
from sklearn import cluster
from utils.utils import *
import json

data_path_base = "./data"
files = [file for file in os.listdir(data_path_base) if file.endswith(".csv")]

# n_clusters = 50
time_substract = (57600 + 86400 * 2) * 1000
time_span = 15 * 60 * 1000
n_spans = 86400 * 1000 // time_span
# k_means = cluster.MiniBatchKMeans(n_clusters=n_clusters, reassignment_ratio=0.01)
# k_means = cluster.KMeans(n_clusters=n_clusters)

try:
    df = pd.read_pickle("./cache/preprocessed_data.pkl")
    print("[LOG] Load Dataframe from cache.")
except FileNotFoundError:
    print("[LOG] Cannot find cached Dataframe.")
    df_list = list()

    for file in files:
        file_path = os.path.join(data_path_base, file)
        df = pd.read_csv(file_path)
        # df.drop(['md5', 'content'], axis=1, inplace=True)
        df_list.append(df)

    print("[LOG] Loaded all files.")

    df = pd.concat(df_list)

    # TODO: data cleaning: phone length
    # data cleaning: remove whitespace, filter by content length
    df['content'] = df['content'].str.replace(" ", "").str.lower()
    df = df[df['content'].str.len() > 2]
    # df['time_span'] = df.apply(lambda x: (int(x['recitime']) - time_substract) // time_span, axis=1)
    df['time_span'] = (df['recitime'].values - time_substract) // time_span * time_span + time_substract

    # df.sort_values(by=['time_span'], inplace=True)
    print("[LOG] Dataframe preprocess finished.")

    df.to_pickle("./cache/preprocessed_data.pkl")
    print("[LOG] Dataframe saved to cache.")

sorted_spans = df['time_span'].unique()
sorted_spans.sort()

lng_lat_maps = list()

keyword_filter = {
    'bill': '票|代开|增值|证',
    'woman': '美女|少妇',
    'fraud': '银行|apple|钱|幸运',
    'gamble': '赌|博彩',
}
rest_filter = '|'.join(keyword_filter.values())

for index, span in enumerate(sorted_spans):
    def push_to_map(X_loc, tag):
        span_len = X_loc.shape[0]
        if index % 30 == 0: print("[LOG] Clustering time span `%s` %d(%d/%d) of length %d." % (tag, span, index + 1, len(sorted_spans), span_len))
        if (span_len == 0): return
        X_loc = np.around(X_loc, 2)
        unique, counts = np.unique(X_loc, return_counts=True, axis=0)
        lng_lat_calc = [{
            'lng': unique[index][0],
            'lat': unique[index][1],
            'count': int(count)
        } for index, count in enumerate(counts)]
        lng_lat_maps.append({
            # 'data': list(filter(lambda x: x["count"] > 1, lng_lat_calc)),
            'data': lng_lat_calc,
            'span': int(span),
            'tag': tag
        })

    selected_rows = df[df['time_span'] == span]
    push_to_map(selected_rows[['lng', 'lat']].values, 'all')
    rest_rows = selected_rows[~selected_rows['content'].str.contains(rest_filter)]
    push_to_map(rest_rows[['lng', 'lat']].values, 'rest')
    for tag, keyword in keyword_filter.items():
        filtered_rows = selected_rows[selected_rows['content'].str.contains(keyword)]
        push_to_map(filtered_rows[['lng', 'lat']].values, tag)

json.dump(lng_lat_maps, open("./export/clustered.json", "w"))