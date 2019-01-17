import utils.coord_transform as coord_transform


def search_sorted_lr(series, value):
    return series.searchsorted(value, 'left')[0], series.searchsorted(value, 'right')[0]


def coord_mapper(data):
    coord = coord_transform.wgs84_to_bd09(data["lng"], data["lat"])
    return {
        'lng': coord[0],
        'lat': coord[1],
        'count': data["count"]
    }

# def push_to_map(X_loc, tag):
#     span_len = X_loc.shape[0]
#     if index % 30 == 0: print("[LOG] Mining time span `%s` %d(%d/%d) of length %d." % (tag, span, index + 1, len(sorted_spans), span_len))
#     if span_len >= n_clusters:
#         k_means.fit(X_loc)
#         unique, counts = np.unique(k_means.labels_, return_counts=True)
#         unique_counts = dict(zip(unique, counts))
#         lng_lat_calc = [{
#             'lng': k_means.cluster_centers_[key][0],
#             'lat': k_means.cluster_centers_[key][1],
#             'count': int(value)
#         } for key, value in unique_counts.items()]
#     else:
#         lng_lat_calc = [{
#             'lng': X_loc[x_ind][0],
#             'lat': X_loc[x_ind][1],
#             'count': 1
#         } for x_ind in range(X_loc.shape[0])]
#
#     lng_lat_maps.append({
#         'data': lng_lat_calc,
#         'span': int(span),
#         'tag': tag
#     })